import os
import warnings
import httpx
from dataclasses import dataclass
from typing import Any

# Import perezoso: los plugins se importan SOLO cuando su provider se usa.
# (importar deepgram/elevenlabs/sarvam juntos tarda ~15s y mata la llamada)


class ProviderAdapterError(RuntimeError):
    pass


@dataclass(frozen=True)
class VoiceProviderAdapters:
    stt: Any
    llm: Any
    tts: Any
    summary: dict[str, str]


def build_voice_provider_adapters(config: dict[str, Any]) -> VoiceProviderAdapters:
    stt = _build_stt(
        config["stt"],
        config["stt"].get("language", config["language"]),
    )
    llm = _build_llm(config["llm"])
    tts = _build_tts(config["tts"], config["language"])
    return VoiceProviderAdapters(
        stt=stt,
        llm=llm,
        tts=tts,
        summary={
            "stt_provider": config["stt"]["provider"],
            "stt_model": config["stt"]["model"],
            "llm_provider": config["llm"]["provider"],
            "llm_model": config["llm"]["model"],
            "tts_provider": config["tts"]["provider"],
            "tts_model": config["tts"]["model"],
            "tts_voice": config["tts"]["voice"],
        },
    )


def _build_stt(config: dict[str, Any], language: str):
    provider = config["provider"]
    model = config["model"]
    if provider == "deepgram":
        from livekit.plugins import deepgram
        return deepgram.STT(
            model=model,
            language=_deepgram_language(language),
            api_key=_required_env("DEEPGRAM_API_KEY"),
        )
    if provider == "sarvam":
        from livekit.plugins import sarvam
        return sarvam.STT(
            model=model,
            language=_sarvam_language(language),
            api_key=_required_env("SARVAM_API_KEY"),
        )
    if provider == "openai":
        openai_plugin = _openai_plugin()
        return openai_plugin.STT(
            model=model,
            language=language,
            base_url=os.getenv("WHISPER_STT_BASE_URL"),
            api_key=os.getenv("WHISPER_STT_API_KEY", "local"),
        )
    raise ProviderAdapterError(f"unsupported STT provider: {provider}")


def _build_llm(config: dict[str, Any]):
    provider = config["provider"]
    if provider == "bedrock":
        aws = _aws_plugin()
        kwargs = {
            "model": config["model"],
            "region": os.getenv("AWS_REGION", "us-east-1"),
        }
        access_key = os.getenv("AWS_ACCESS_KEY_ID")
        secret_key = os.getenv("AWS_SECRET_ACCESS_KEY")
        if access_key or secret_key:
            if not access_key:
                raise ProviderAdapterError("AWS_ACCESS_KEY_ID is required when AWS_SECRET_ACCESS_KEY is set")
            if not secret_key:
                raise ProviderAdapterError("AWS_SECRET_ACCESS_KEY is required when AWS_ACCESS_KEY_ID is set")
            kwargs["api_key"] = access_key
            kwargs["api_secret"] = secret_key
        return aws.LLM(**kwargs)

    if provider == "openai":
        openai_plugin = _openai_plugin()
        kwargs = {
            "model": config["model"],
            "base_url": os.getenv("OPENAI_BASE_URL"),
            "api_key": os.getenv("OPENAI_API_KEY"),
            "timeout": httpx.Timeout(
                float(os.getenv("OPENAI_LLM_TIMEOUT_SECONDS", "90")),
                connect=5.0,
            ),
            "max_retries": 0,
        }
        return openai_plugin.LLM(**kwargs)
    raise ProviderAdapterError(f"unsupported LLM provider: {provider}")


def _build_tts(config: dict[str, Any], language: str):
    provider = config["provider"]
    model = config["model"]
    voice = config["voice"]
    if provider == "elevenlabs":
        from livekit.plugins import elevenlabs
        return elevenlabs.TTS(
            model=model,
            voice_id=voice,
            language=_elevenlabs_language(language),
            api_key=_required_env("ELEVENLABS_API_KEY"),
        )
    if provider == "deepgram":
        from livekit.plugins import deepgram
        return deepgram.TTS(
            model=voice or model,
            api_key=_required_env("DEEPGRAM_API_KEY"),
        )
    if provider == "sarvam":
        from livekit.plugins import sarvam
        return sarvam.TTS(
            model=model,
            speaker=voice,
            target_language_code=_sarvam_language(language),
            api_key=_required_env("SARVAM_API_KEY"),
        )
    if provider == "openai":
        openai_plugin = _openai_plugin()
        tts = openai_plugin.TTS(
            model=model,
            voice=voice,
            base_url=os.getenv("KOKORO_TTS_BASE_URL"),
            api_key=os.getenv("KOKORO_TTS_API_KEY", "local"),
            response_format="wav",
        )
        # El servidor Kokoro local devuelve WAV binario en una sola respuesta
        # (no SSE). Forzar el stream binario (AudioChunkedStream) en vez del
        # SSE que el plugin usa por defecto para modelos no listados.
        try:
            from livekit.plugins.openai import tts as _oai_tts
            _oai_tts.AUDIO_STREAM_MODELS.add(model)
        except Exception:
            pass
        return tts
    raise ProviderAdapterError(f"unsupported TTS provider: {provider}")


def _openai_plugin():
    # Import directo de las clases (1.8s) en vez del paquete completo (11s:
    # el __init__ importa realtime/responses/tools que no usamos).
    # NOTA: las clases NO ven las variables de la funcion que las envuelve,
    # por eso se asignan por dict y se construye el objeto con type().
    from livekit.plugins.openai import LLM, STT, TTS

    return type("_OpenAI", (), {"LLM": LLM, "STT": STT, "TTS": TTS})


def _aws_plugin():
    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message="TranscribeStreamingClient is deprecated.*",
            category=DeprecationWarning,
        )
        from livekit.plugins import aws

    return aws


def _required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ProviderAdapterError(f"{name} is required for the selected voice provider")
    return value


def _deepgram_language(language: str) -> str:
    return {
        "en": "en-US",
        "en-IN": "en-IN",
        "hi": "hi",
    }.get(language, language)


def _elevenlabs_language(language: str) -> str:
    return {
        "en": "en",
        "en-IN": "en",
        "hi": "hi",
    }.get(language, language)


def _sarvam_language(language: str) -> str:
    return {
        "en": "en-IN",
        "en-IN": "en-IN",
        "hi": "hi-IN",
    }.get(language, language)
