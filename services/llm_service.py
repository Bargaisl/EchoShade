from groq import Groq, APIStatusError
from core.config import settings
from core.prompts import get_interview_suggestion_prompt

def verify_groq_api_key():
    """
    Verifies the Groq API key by making a simple test call.
    Returns True if the key is valid, False otherwise.
    """
    if not settings.GROQ_API_KEY:
        return False
    try:
        client = Groq(api_key=settings.GROQ_API_KEY)
        # Make a simple, low-cost call to check credentials
        client.models.list()
        return True
    except APIStatusError as e:
        # This error is typically raised for authentication issues (e.g., 401)
        print(f"ERROR: Groq API key verification failed. Status: {e.status_code}, Message: {e.message}")
        return False
    except Exception as e:
        print(f"ERROR: An unexpected error occurred while verifying Groq key: {e}")
        return False

def get_ai_suggestion(question: str, context: dict) -> str:
    """
    Gets an AI-generated suggestion for an interview question.
    Optimized for real-time speed.
    """
    try:
        client = Groq(api_key=settings.GROQ_API_KEY)
        prompt = get_interview_suggestion_prompt(question, context)
        
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            model="llama3-8b-8192",  # Fast model
            temperature=0.3,  # Lower temperature for faster, more focused responses
            max_tokens=150,   # Limit response length for speed
            top_p=0.8,       # Focus on most likely tokens for speed
        )
        
        suggestion = chat_completion.choices[0].message.content
        return suggestion.strip()
        
    except Exception as e:
        print(f"❌ ERROR: Could not get AI suggestion: {e}")
        return "Error: Could not generate a suggestion at this time."