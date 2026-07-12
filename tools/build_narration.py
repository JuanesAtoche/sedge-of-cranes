#!/usr/bin/env python3
"""
build_narration.py — builds narration.mp3 + narration.vtt from the script.

The PLACEHOLDER voice is espeak-ng (open source, robotic). Replace it with
a warm human recording before showing this to children! The design makes
that easy:

  * Subtitle cue timings are measured from the real audio segments, so
    the VTT is always in sync with whatever audio this script produces.
  * The 3 animation beats are keyed to CUE NUMBERS (see js/app.js), not
    seconds — re-record the audio, re-run this script's timing logic (or
    hand-edit the VTT), and the beats stay aligned.

To use a human recording: record each line below as its own file
(line01.wav … line12.wav, any recorder works), drop them in a folder,
and run:  python3 tools/build_narration.py path/to/folder
"""
import subprocess, sys, wave, os, io

LINES = [
    "High above a quiet pond, seven paper cranes fly together.",
    "Do you see the little red one, right at the front?",
    "Her name is Mika. But she wasn't always the leader.",
    "Mika's very first fold was crooked. Her wings pointed the wrong way, and she wobbled when she flew.",   # BEAT 1: wobble
    "I can't do it, Mika sighed.",
    "Not yet, said Grandmother Crane. Every fold teaches your wings something new.",
    "So Mika practiced. One fold. Then another. Each one a little braver than the last.",                    # BEAT 2: loop
    "Her wobbles turned into swoops. Her swoops turned into loops!",
    "And the other cranes said: Mika, you fly so well. Will you show us the way?",
    "Now the whole flock flies together, higher than any crane could fly alone.",                            # BEAT 3: circle
    "Your crane is part of the flock now.",
    "What will you fold next?",
]
GAP = 0.75          # seconds of silence between lines (storytelling pace)
LEAD_IN = 0.5

def synth_line(text, path):
    """Placeholder voice: espeak-ng, slowed down, higher pitch."""
    subprocess.run(["espeak-ng", "-v", "en+f3", "-s", "145", "-p", "60",
                    "-w", path, text], check=True)

def wav_params_and_frames(path):
    with wave.open(path, "rb") as w:
        return w.getparams(), w.readframes(w.getnframes())

def main():
    src_dir = sys.argv[1] if len(sys.argv) > 1 else None
    os.makedirs("/tmp/narr", exist_ok=True)
    segs = []
    for i, text in enumerate(LINES):
        p = f"/tmp/narr/line{i+1:02d}.wav"
        if src_dir:  # human recordings supplied
            p = os.path.join(src_dir, f"line{i+1:02d}.wav")
        else:
            synth_line(text, p)
        segs.append(p)

    # concatenate with gaps, recording each line's [start, end]
    params, _ = wav_params_and_frames(segs[0])
    rate, width, ch = params.framerate, params.sampwidth, params.nchannels
    silence = lambda sec: b"\x00" * int(sec * rate) * width * ch
    out = io.BytesIO()
    cues = []
    with wave.open(out, "wb") as w:
        w.setnchannels(ch); w.setsampwidth(width); w.setframerate(rate)
        w.writeframes(silence(LEAD_IN))
        t = LEAD_IN
        for p, text in zip(segs, LINES):
            prm, frames = wav_params_and_frames(p)
            dur = prm.nframes / prm.framerate
            cues.append((t, t + dur, text))
            w.writeframes(frames)
            w.writeframes(silence(GAP))
            t += dur + GAP

    open("/tmp/narr/full.wav", "wb").write(out.getvalue())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", "/tmp/narr/full.wav",
                    "-codec:a", "libmp3lame", "-b:a", "64k", "-ac", "1",
                    "narration.mp3"], check=True)

    def ts(sec):
        m, s = divmod(sec, 60)
        return f"00:{int(m):02d}:{s:06.3f}"

    with open("narration.vtt", "w") as f:
        f.write("WEBVTT\n\n")
        for i, (a, b, text) in enumerate(cues):
            f.write(f"{i+1}\n{ts(a)} --> {ts(b + 0.35)}\n{text}\n\n")

    total = cues[-1][1] + GAP
    print(f"narration.mp3 written — total {total:.1f}s, {len(cues)} cues")

if __name__ == "__main__":
    main()
