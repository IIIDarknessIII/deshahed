from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, case_sensitive=False)

    app_env: str = Field(default="dev")
    database_url: str
    redis_url: str
    cors_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000",
        description="Comma-separated allow-list for the CORS middleware.",
    )
    sentry_dsn: str = Field(default="")

    # WebPush — leave empty to disable push notifications entirely.
    vapid_private_key: str = Field(default="")
    vapid_public_key: str = Field(default="")
    vapid_subject: str = Field(default="mailto:noreply@xn----8sbkccc5iwa.online")

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
