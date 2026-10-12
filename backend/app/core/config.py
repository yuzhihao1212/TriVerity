from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/.env, found the same way whichever directory the server is started from.
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    llm_provider: str = ""
    llm_api_key: str = ""
    llm_model: str = ""
    llm_base_url: str = ""
    # Sends `thinking: {"type": "disabled"}`; cuts Hy3 latency and tokens several-fold.
    # Leave off for providers that reject unknown request fields.
    llm_disable_thinking: bool = False
    # Public demo (auth tier T1): resolve only the bundled samples, loaded by the
    # server, cached, with the API docs switched off. Set PUBLIC_DEMO=true.
    public_demo: bool = False
    # Access codes (auth tier T2), comma-separated, one per invited judge. A valid
    # X-Demo-Key header lets the caller resolve their own dispute. Keep them in .env only.
    demo_access_codes: str = ""
    # Optional overrides of the defaults in app/core/limits.py, e.g. a bigger budget
    # for a local evaluation run. Bounds are checked there; overrides are logged.
    daily_token_budget: int | None = None
    daily_resolve_budget: int | None = None
    per_ip_per_minute: int | None = None
    per_ip_per_day: int | None = None
    global_per_minute: int | None = None
    per_code_per_minute: int | None = None
    per_code_per_day: int | None = None
    database_url: str = "sqlite:///./ryde_disputes.db"

settings = Settings()
