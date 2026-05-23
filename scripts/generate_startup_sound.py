"""
Generates a unique startup sound for seaserver.

Acts in four cinematic stages:
  1. Waves crashing   (filtered noise swells, stereo wash)
  2. Roaring buildup  (sub-bass rumble + growing noise + rising pitch)
  3. Explosion        (sharp transient burst + boom)
  4. Pleasant resolve (warm Cmaj9 bell chord with slow tail)

Output: web/sounds/startup.wav  (48 kHz, 16-bit stereo)

Pure stdlib — no numpy/scipy needed.
"""

import math
import os
import random
import struct
import wave

# ---------- Config ----------
SR = 48_000
DUR_WAVES = 2.6
DUR_ROAR = 1.8
DUR_BOOM = 0.9
DUR_PLEASANT = 4.0
TOTAL = DUR_WAVES + DUR_ROAR + DUR_BOOM + DUR_PLEASANT

OUT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "web", "sounds", "startup.wav",
)

random.seed(20260522)
N = int(SR * TOTAL)
L = [0.0] * N
R = [0.0] * N


def add(buf, idx, val):
    if 0 <= idx < len(buf):
        buf[idx] += val


def lerp(a, b, t):
    return a + (b - a) * t


def smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


# Simple 1-pole low-pass / high-pass state-machine helpers
class OnePoleLP:
    def __init__(self, cutoff_hz):
        self.set_cutoff(cutoff_hz)
        self.y = 0.0
    def set_cutoff(self, cutoff_hz):
        x = math.exp(-2 * math.pi * cutoff_hz / SR)
        self.a = 1 - x
        self.b = x
    def process(self, x):
        self.y = self.a * x + self.b * self.y
        return self.y


class OnePoleHP:
    def __init__(self, cutoff_hz):
        self.lp = OnePoleLP(cutoff_hz)
    def process(self, x):
        return x - self.lp.process(x)


# ---------- Stage 1: Waves crashing ----------
def render_waves(start_sample):
    n = int(DUR_WAVES * SR)
    lp_l = OnePoleLP(900)
    lp_r = OnePoleLP(900)
    hp_l = OnePoleHP(120)
    hp_r = OnePoleHP(120)

    # Three overlapping wave swells
    swells = [
        (0.00, 1.10, 0.55),   # (start_t, dur, gain)
        (0.55, 1.25, 0.70),
        (1.25, 1.30, 0.85),
    ]

    for i in range(n):
        t = i / SR
        # Slow filter sweep to imitate "approaching" wave
        sweep = 600 + 1800 * (0.5 - 0.5 * math.cos(2 * math.pi * t / DUR_WAVES))
        lp_l.set_cutoff(sweep)
        lp_r.set_cutoff(sweep * 1.05)

        env = 0.0
        for (s, d, g) in swells:
            if s <= t <= s + d:
                u = (t - s) / d
                # Smooth attack, longer decay for breaking foam
                e = math.sin(math.pi * u) ** 1.4
                env += e * g

        nL = random.uniform(-1.0, 1.0)
        nR = random.uniform(-1.0, 1.0)
        sL = hp_l.process(lp_l.process(nL)) * env
        sR = hp_r.process(lp_r.process(nR)) * env

        # Sub-rumble underneath
        rumble = math.sin(2 * math.pi * 45 * t) * 0.05 * env
        sL += rumble
        sR += rumble * 0.9

        add(L, start_sample + i, sL * 0.55)
        add(R, start_sample + i, sR * 0.55)


# ---------- Stage 2: Roaring buildup ----------
def render_roar(start_sample):
    n = int(DUR_ROAR * SR)
    lp_l = OnePoleLP(400)
    lp_r = OnePoleLP(400)

    for i in range(n):
        t = i / SR
        u = t / DUR_ROAR
        env = u ** 1.3   # crescendo

        # Filter opens up as it builds
        lp_l.set_cutoff(300 + 2200 * u)
        lp_r.set_cutoff(320 + 2200 * u)

        # Rising pitch growl (50 -> 140 Hz) with tremolo
        f = lerp(50, 140, u)
        growl = (
            math.sin(2 * math.pi * f * t)
            + 0.6 * math.sin(2 * math.pi * f * 1.5 * t)
            + 0.3 * math.sin(2 * math.pi * f * 2.0 * t)
        ) / 1.9
        tremolo = 0.7 + 0.3 * math.sin(2 * math.pi * 7 * t)
        growl *= tremolo

        nL = random.uniform(-1, 1)
        nR = random.uniform(-1, 1)
        noiseL = lp_l.process(nL)
        noiseR = lp_r.process(nR)

        sL = (growl * 0.55 + noiseL * 0.55) * env
        sR = (growl * 0.55 + noiseR * 0.55) * env

        add(L, start_sample + i, sL * 0.75)
        add(R, start_sample + i, sR * 0.75)


# ---------- Stage 3: Explosion / impact ----------
def render_boom(start_sample):
    n = int(DUR_BOOM * SR)
    # Sharp transient: short burst of full-band noise + low-pitched boom that decays.
    lp_l = OnePoleLP(8000)
    lp_r = OnePoleLP(8000)

    # Pre-impact silence-ish quick drop (handled by envelope shape)
    for i in range(n):
        t = i / SR
        # Crack: very short noisy peak at start
        crack_env = math.exp(-t * 35)
        nL = random.uniform(-1, 1) * crack_env
        nR = random.uniform(-1, 1) * crack_env

        # Boom: low sine drop 90 -> 35 Hz, long decay
        f = 90 * math.exp(-t * 1.8) + 35
        boom_env = math.exp(-t * 2.2)
        boom = math.sin(2 * math.pi * f * t) * boom_env

        # Sub
        sub = math.sin(2 * math.pi * 28 * t) * math.exp(-t * 1.5) * 0.6

        # Sparkle "shimmer" tail (very quiet, sets up the chord)
        shimmer_env = max(0.0, (t - 0.25) / (DUR_BOOM - 0.25))
        shimmer = (
            math.sin(2 * math.pi * 2093 * t) * 0.05
            + math.sin(2 * math.pi * 2637 * t) * 0.04
            + math.sin(2 * math.pi * 3136 * t) * 0.03
        ) * shimmer_env

        # Light filter movement on crack
        lp_l.set_cutoff(1500 + 6000 * crack_env)
        lp_r.set_cutoff(1500 + 6000 * crack_env)
        crackL = lp_l.process(nL)
        crackR = lp_r.process(nR)

        sL = boom + sub + crackL * 0.9 + shimmer
        sR = boom + sub + crackR * 0.9 + shimmer

        add(L, start_sample + i, sL * 0.85)
        add(R, start_sample + i, sR * 0.85)


# ---------- Stage 4: Pleasant resolution ----------
def render_pleasant(start_sample):
    """Warm Cmaj9 bell-pad with slow attack, gentle vibrato, and exponential tail."""
    n = int(DUR_PLEASANT * SR)

    # Cmaj9: C4, E4, G4, B4, D5
    chord = [261.63, 329.63, 392.00, 493.88, 587.33]
    # Slight detune per voice for warmth
    detunes = [1.000, 1.003, 0.997, 1.002, 0.999]

    # Pre-compute a soft "swell-in" envelope, then long exponential decay
    attack_t = 0.35
    for i in range(n):
        t = i / SR
        # Attack
        if t < attack_t:
            atk = smoothstep(t / attack_t)
        else:
            atk = 1.0
        decay = math.exp(-(t - attack_t) * 0.55) if t >= attack_t else 1.0
        env = atk * decay

        # Slow vibrato
        vib = 1 + 0.0025 * math.sin(2 * math.pi * 5.2 * t)

        sL = 0.0
        sR = 0.0
        for idx, f0 in enumerate(chord):
            f = f0 * detunes[idx] * vib
            # Bell-ish timbre: fundamental + soft odd partials + a 2x partial
            voice = (
                math.sin(2 * math.pi * f * t)
                + 0.32 * math.sin(2 * math.pi * f * 2 * t)
                + 0.12 * math.sin(2 * math.pi * f * 3 * t) * math.exp(-t * 1.2)
                + 0.06 * math.sin(2 * math.pi * f * 4 * t) * math.exp(-t * 2.0)
            )
            # Pan voices subtly across stereo field
            pan = (idx - 2) / 4.0   # -0.5 .. +0.5
            gL = math.cos((pan + 0.5) * math.pi / 2)
            gR = math.sin((pan + 0.5) * math.pi / 2)
            sL += voice * gL
            sR += voice * gR

        sL *= env * 0.085
        sR *= env * 0.085

        # Subtle airy noise shimmer for "pleasant" sparkle
        if t < 1.8:
            shimmer = random.uniform(-1, 1) * 0.012 * env * max(0.0, 1 - t / 1.8)
            sL += shimmer
            sR += shimmer * 0.9

        add(L, start_sample + i, sL)
        add(R, start_sample + i, sR)


# ---------- Render stages ----------
print(f"Rendering {TOTAL:.2f}s @ {SR} Hz ...")
s0 = 0
render_waves(s0); s0 += int(DUR_WAVES * SR)
# Crossfade roar over end of waves
render_roar(s0 - int(0.25 * SR))
s0 += int(DUR_ROAR * SR) - int(0.25 * SR)
render_boom(s0 - int(0.05 * SR))
s0 += int(DUR_BOOM * SR) - int(0.05 * SR)
render_pleasant(s0 - int(0.15 * SR))

# ---------- Master: gentle limiter + master fade-out ----------
fade_samples = int(0.35 * SR)
for i in range(len(L)):
    # Soft tanh limiter
    L[i] = math.tanh(L[i] * 1.05)
    R[i] = math.tanh(R[i] * 1.05)
    # Master fade-out at the very end
    j = len(L) - i
    if j < fade_samples:
        g = j / fade_samples
        L[i] *= g
        R[i] *= g

# Normalize to ~ -1.5 dBFS
peak = max(max(abs(x) for x in L), max(abs(x) for x in R), 1e-9)
target = 0.84
norm = target / peak
for i in range(len(L)):
    L[i] *= norm
    R[i] *= norm

# ---------- Write WAV ----------
os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
with wave.open(OUT_PATH, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    frames = bytearray()
    for i in range(len(L)):
        lv = max(-1.0, min(1.0, L[i]))
        rv = max(-1.0, min(1.0, R[i]))
        frames += struct.pack("<hh", int(lv * 32767), int(rv * 32767))
    w.writeframes(bytes(frames))

size_kb = os.path.getsize(OUT_PATH) / 1024
print(f"Wrote {OUT_PATH} ({size_kb:.1f} KB, {TOTAL:.2f}s)")
