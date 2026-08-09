import test from 'node:test';
import assert from 'node:assert/strict';

import { StillnessAudio, mapAudioParameters } from '../src/audio/stillness-audio.ts';
import type { ResonanceState } from '../src/resonance/resonance.ts';

type ParamEvent =
  | { type: 'cancel' | 'hold'; time: number }
  | { type: 'ramp'; value: number; time: number }
  | { type: 'set'; value: number; time: number }
  | { type: 'target'; value: number; time: number; timeConstant: number };

class FakeAudioParam {
  value = 0;
  readonly events: ParamEvent[] = [];
  cancelAndHoldAtTime?: (time: number) => FakeAudioParam;

  constructor(supportsHold = true) {
    if (supportsHold) {
      this.cancelAndHoldAtTime = (time) => {
        this.events.push({ type: 'hold', time });
        return this;
      };
    }
  }

  cancelScheduledValues(time: number): FakeAudioParam {
    this.events.push({ type: 'cancel', time });
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number): FakeAudioParam {
    this.events.push({ type: 'ramp', value, time });
    return this;
  }

  setValueAtTime(value: number, time: number): FakeAudioParam {
    this.value = value;
    this.events.push({ type: 'set', value, time });
    return this;
  }

  setTargetAtTime(value: number, time: number, timeConstant: number): FakeAudioParam {
    this.events.push({ type: 'target', value, time, timeConstant });
    return this;
  }
}

class FakeAudioNode {
  connect(_destination: unknown): unknown {
    return _destination;
  }
}

class FakeGainNode extends FakeAudioNode {
  readonly gain: FakeAudioParam;

  constructor(gain: FakeAudioParam) {
    super();
    this.gain = gain;
  }
}

class FakeSourceNode extends FakeAudioNode {
  readonly frequency = new FakeAudioParam();
  readonly detune = new FakeAudioParam();
  type = 'sine';
  buffer: unknown = null;
  loop = false;

  start(): void {}
  stop(_time?: number): void {}
  addEventListener(_type: string, _listener: () => void, _options?: unknown): void {}
}

type FakeContextOptions = {
  initialState?: 'running' | 'suspended';
  masterSupportsHold?: boolean;
};

class FakeAudioContext {
  currentTime = 4;
  state: 'running' | 'suspended' | 'closed';
  readonly sampleRate = 4;
  readonly destination = new FakeAudioNode();
  readonly gains: FakeGainNode[] = [];
  resumeCalls = 0;
  suspendCalls = 0;
  closeCalls = 0;
  rejectResume = false;
  private readonly options: FakeContextOptions;

  constructor(options: FakeContextOptions) {
    this.options = options;
    this.state = options.initialState ?? 'running';
  }

  createGain(): FakeGainNode {
    const gain = new FakeGainNode(
      new FakeAudioParam(this.gains.length === 0 ? this.options.masterSupportsHold : true),
    );
    this.gains.push(gain);
    return gain;
  }

  createBiquadFilter(): FakeAudioNode & {
    type: string;
    frequency: FakeAudioParam;
    Q: FakeAudioParam;
  } {
    return Object.assign(new FakeAudioNode(), {
      type: 'lowpass',
      frequency: new FakeAudioParam(),
      Q: new FakeAudioParam(),
    });
  }

  createDelay(_maximumDelayTime?: number): FakeAudioNode & { delayTime: FakeAudioParam } {
    return Object.assign(new FakeAudioNode(), { delayTime: new FakeAudioParam() });
  }

  createOscillator(): FakeSourceNode {
    return new FakeSourceNode();
  }

  createBufferSource(): FakeSourceNode {
    return new FakeSourceNode();
  }

  createBuffer(_channels: number, length: number, _sampleRate: number): {
    getChannelData: (_channel: number) => Float32Array;
  } {
    return { getChannelData: () => new Float32Array(length) };
  }

  async resume(): Promise<void> {
    this.resumeCalls += 1;
    if (this.rejectResume) throw new Error('resume rejected');
    this.state = 'running';
  }

  async suspend(): Promise<void> {
    this.suspendCalls += 1;
    this.state = 'suspended';
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
    this.state = 'closed';
  }
}

function installAudioContext(options: FakeContextOptions = {}): {
  contexts: FakeAudioContext[];
  restore: () => void;
} {
  const contexts: FakeAudioContext[] = [];
  const originalAudioContext = globalThis.AudioContext;
  const originalWindow = globalThis.window;
  class InstalledAudioContext extends FakeAudioContext {
    constructor(_options?: AudioContextOptions) {
      super(options);
      contexts.push(this);
    }
  }
  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    value: InstalledAudioContext,
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      setTimeout(callback: () => void): number {
        callback();
        return 1;
      },
    },
  });
  return {
    contexts,
    restore: () => {
      if (originalAudioContext) {
        Object.defineProperty(globalThis, 'AudioContext', {
          configurable: true,
          value: originalAudioContext,
        });
      } else delete (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', {
          configurable: true,
          value: originalWindow,
        });
      } else delete (globalThis as { window?: Window }).window;
    },
  };
}

async function withAudioContext(
  options: FakeContextOptions,
  run: (contexts: FakeAudioContext[]) => Promise<void>,
): Promise<void> {
  const installed = installAudioContext(options);
  try {
    await run(installed.contexts);
  } finally {
    installed.restore();
  }
}

function targetEvents(parameter: FakeAudioParam): Extract<ParamEvent, { type: 'target' }>[] {
  return parameter.events.filter(
    (event): event is Extract<ParamEvent, { type: 'target' }> => event.type === 'target',
  );
}

const activeState: ResonanceState = {
  complexity: 0.9,
  turbulence: 0.8,
  coherence: 0.2,
  focus: 0.85,
  depth: 0.8,
  pulse: 0.9,
  audioEnergy: 0.9,
  warmth: 0.8,
  space: 0.15,
};

test('a restarted audio instance stays silent by default', async () => {
  await withAudioContext({}, async (contexts) => {
    const audio = new StillnessAudio();
    await audio.start();
    audio.update(activeState, 1);
    await audio.setMode('off');
    audio.dispose();

    await audio.start();

    assert.equal(contexts.length, 2);
    assert.deepEqual(contexts[1]?.gains[0]?.gain.events.at(-1), {
      type: 'ramp',
      value: 0.0001,
      time: 5.8,
    });
  });
});

test('sound mode fades hold the current scheduled value before targeting', async () => {
  await withAudioContext({}, async (contexts) => {
    const audio = new StillnessAudio();
    await audio.start();

    await audio.setMode('waves');

    assert.deepEqual(contexts[0]?.gains[0]?.gain.events.slice(-2), [
      { type: 'hold', time: 4 },
      { type: 'target', value: 0.28, time: 4, timeConstant: 0.45 },
    ]);
  });
});

test('disposal holds the current scheduled value before targeting silence', async () => {
  await withAudioContext({}, async (contexts) => {
    const audio = new StillnessAudio();
    await audio.start();

    audio.dispose();

    assert.deepEqual(contexts[0]?.gains[0]?.gain.events.slice(-2), [
      { type: 'hold', time: 4 },
      { type: 'target', value: 0.0001, time: 4, timeConstant: 0.08 },
    ]);
  });
});

test('repeated starts and sound mode calls are idempotent', async () => {
  await withAudioContext({}, async (contexts) => {
    const audio = new StillnessAudio();
    await audio.start();
    await audio.start();
    const master = contexts[0]?.gains[0]?.gain;

    await audio.setMode('waves');
    const scheduledAfterEnable = master?.events.length;
    await audio.setMode('waves');

    assert.equal(contexts.length, 1);
    assert.equal(master?.events.length, scheduledAfterEnable);
  });
});

test('enabling sound resumes a suspended context before scheduling its fade', async () => {
  await withAudioContext({}, async (contexts) => {
    const audio = new StillnessAudio();
    await audio.start();
    await audio.setMode('waves');
    await audio.setMode('off');
    const context = contexts[0];
    assert.ok(context);
    context.state = 'suspended';

    await audio.setMode('waves');

    assert.equal(context.resumeCalls, 1);
    assert.equal(targetEvents(context.gains[0]!.gain).at(-1)?.value, 0.28);
  });
});

test('adaptive updates remain current while sound is muted', async () => {
  await withAudioContext({}, async (contexts) => {
    const audio = new StillnessAudio();
    await audio.start();
    await audio.setMode('off');

    audio.update(activeState, 1);
    const master = contexts[0]!.gains[0]!.gain;
    assert.equal(targetEvents(master).at(-1)?.value, 0.0001);

    await audio.setMode('waves');
    assert.equal(targetEvents(master).at(-1)?.value, 0.28);
  });
});

test('unavailable audio returns false and a rejected resume leaves no fade scheduled', async () => {
  const unavailable = new StillnessAudio();
  assert.equal(await unavailable.setMode('waves'), false);

  await withAudioContext({}, async (contexts) => {
    const audio = new StillnessAudio();
    await audio.start();
    await audio.setMode('off');
    const context = contexts[0]!;
    const master = context.gains[0]!.gain;
    const scheduledBeforeEnable = master.events.length;
    context.state = 'suspended';
    context.rejectResume = true;

    await assert.rejects(() => audio.setMode('waves'), /resume rejected/);
    assert.equal(master.events.length, scheduledBeforeEnable);
  });
});

test('audibility fades safely fall back when cancel-and-hold is unavailable', async () => {
  await withAudioContext({ masterSupportsHold: false }, async (contexts) => {
    const audio = new StillnessAudio();
    await audio.start();
    const master = contexts[0]!.gains[0]!.gain;
    master.value = 0.037;

    await audio.setMode('waves');

    assert.deepEqual(master.events.slice(-3), [
      { type: 'cancel', time: 4 },
      { type: 'set', value: 0.037, time: 4 },
      { type: 'target', value: 0.28, time: 4, timeConstant: 0.45 },
    ]);
  });
});
