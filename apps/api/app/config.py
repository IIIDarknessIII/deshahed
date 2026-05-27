from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, case_sensitive=False)

    app_env: str = Field(default="dev")
    database_url: str
    redis_url: str


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
