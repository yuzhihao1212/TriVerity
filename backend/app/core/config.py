from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    llm_provider: str = ""
    llm_api_key: str = ""
    llm_model: str = ""
    llm_base_url: str = ""
    database_url: str = "sqlite:///./ryde_disputes.db"

    class Config:
        env_file = ".env"

settings = Settings()
