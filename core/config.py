from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """
    Manages application settings and loads them from a .env file.
    """
    DEEPGRAM_API_KEY: str
    GROQ_API_KEY: str
    LOG_LEVEL: str = "INFO"
    
    # Development Mode - Controls debugging features
    DEV_MODE: bool = True
    
    # AI Configuration
    TRACK_CANDIDATE_RESPONSES: bool = True  # Track what candidate says for better context
    INCLUDE_CONVERSATION_HISTORY: bool = True  # Include recent conversation in prompts
    MAX_CONVERSATION_HISTORY: int = 5  # Number of recent exchanges to remember
    GENERATE_FULL_ANSWERS: bool = True  # Generate complete answers, not just suggestions
    PERSONALIZE_ANSWERS: bool = True  # Use candidate profile in answers

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding='utf-8',
        case_sensitive=True
    )

# Create a single, reusable instance of the settings
settings = Settings()