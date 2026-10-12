import sys, time
t = time.time()
try:
    import chatterbox
    from chatterbox.tts import ChatterboxTTS
    from chatterbox.tts_turbo import ChatterboxTurboTTS
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    print("WARMUP_OK", round(time.time()-t, 1), flush=True)
except Exception as e:
    print("WARMUP_FAIL", type(e).__name__, str(e)[:300], flush=True)
    sys.exit(1)
