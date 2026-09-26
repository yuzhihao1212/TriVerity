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
    database_url: str = "sqlite:///./ryde_disputes.db"

settings = Settings()
