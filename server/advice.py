"""Bounded, server-only OpenAI access; Python standard library only."""
import json
import math
import os
import threading
import time
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
POLICY = json.loads((ROOT / 'server/advice-policy.json').read_text())


def load_settings():
    values = {}
    path = ROOT / '.env.local'
    if path.is_file():
        for line in path.read_text().splitlines():
            key, sep, value = line.strip().partition('=')
            if sep and key in ('OPENAI_API_KEY', 'OPENAI_MODEL'):
                values[key] = value.strip().strip('\"\'')
    for key in ('OPENAI_API_KEY', 'OPENAI_MODEL'):
        if os.environ.get(key):
            values[key] = os.environ[key]
    return values


def clean(value, schema):
    if schema == 'bool':
        if not isinstance(value, bool):
            raise ValueError('Invalid boolean')
        return value
    if isinstance(schema, list):
        if type(value) not in (int, float) or not math.isfinite(value) or not schema[0] <= value <= schema[1]:
            raise ValueError('Invalid number')
        return value
    if not isinstance(value, dict):
        raise ValueError('Invalid object')
    return {k: clean(value.get(k), s) for k, s in schema.items()}


def validate_snapshot(value):
    result = clean(value, POLICY['schema'])
    plots = value.get('plots')
    if not isinstance(plots, list) or len(plots) > 24:
        raise ValueError('Invalid plots')
    result['plots'] = []
    for p in plots:
        if not isinstance(p, dict) or p.get('crop') not in (None, 'lettuce', 'wheat', 'berries', 'corn', 'tomatoes'):
            raise ValueError('Invalid crop')
        plot = clean(p, dict(number=[1, 24], growth=[0, 100], moisture=[0, 100], health=[0, 100], sheltered='bool', stormSafe='bool'))
        plot['crop'] = p['crop']
        result['plots'].append(plot)
    quests = value.get('readyQuests')
    allowed = ['firstHarvest', 'firstSale', 'firstPlot', 'firstStore', 'crowPatrol', 'berryHarvest', 'berryCentury']
    if not isinstance(quests, list) or len(quests) > 7 or any(q not in allowed for q in quests):
        raise ValueError('Invalid quests')
    result['readyQuests'] = quests
    return result


def response_payload(snapshot, topic, model):
    return dict(model=model, instructions=POLICY['instructions'], input=json.dumps(dict(topic=topic, snapshot=snapshot)),
                store=False, reasoning={'effort': 'none'}, max_output_tokens=150,
                text={'format': {'type': 'json_schema', 'name': 'farmer_caren', 'strict': True,
                                 'schema': {'type': 'object', 'properties': {'text': {'type': 'string'}},
                                            'required': ['text'], 'additionalProperties': False}}})


class AdviceService:
    def __init__(self, settings=None, opener=urlopen):
        self.settings = load_settings() if settings is None else settings
        self.opener = opener
        self.lock = threading.Lock()
        self.start = time.monotonic()
        self.last = -100
        self.count = 0

    def answer(self, body):
        snapshot = validate_snapshot(body.get('snapshot'))
        topic = body.get('topic')
        if topic not in POLICY['topics']:
            raise ValueError('Invalid topic')
        fallback = (200, {'source': 'builtin'})
        key = self.settings.get('OPENAI_API_KEY')
        if not key or snapshot['warning'] or snapshot['storm'] or snapshot['crowPlot']:
            return fallback
        with self.lock:
            now = time.monotonic()
            if now - self.start >= 3600:
                self.start, self.count = now, 0
            if now - self.last < 15 or self.count >= 60:
                return 429, {'source': 'builtin'}
            self.last, self.count = now, self.count + 1
        payload = response_payload(snapshot, topic, self.settings.get('OPENAI_MODEL', POLICY['model']))
        request = Request('https://api.openai.com/v1/responses', data=json.dumps(payload).encode(),
                          headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
        try:
            with self.opener(request, timeout=5.5) as response:
                data = json.load(response)
            if data.get('status') != 'completed':
                return fallback
            output = ''.join(c['text'] for x in data.get('output', []) for c in x.get('content', []) if c.get('type') == 'output_text')
            text = json.loads(output).get('text')
            if not isinstance(text, str) or not text.strip() or len(text) > 260:
                return fallback
            return 200, {'source': 'ai', 'text': text.strip()}
        except Exception:
            # Never echo upstream responses, authorization headers, or credentials.
            return fallback
