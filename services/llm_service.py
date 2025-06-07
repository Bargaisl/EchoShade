from groq import Groq, APIStatusError
from core.config import settings
from core.prompts import get_interview_answer_prompt, get_quick_response_prompt, is_complex_question
from typing import Dict, List

# Global conversation history storage
conversation_history: List[Dict] = []

def add_to_conversation_history(interviewer_question: str = None, candidate_response: str = None):
    """Add an exchange to the conversation history."""
    global conversation_history
    
    if not settings.TRACK_CANDIDATE_RESPONSES:
        return
    
    # Find or create the current exchange
    if conversation_history and not conversation_history[-1].get('candidate_response') and candidate_response:
        # Add candidate response to the last exchange
        conversation_history[-1]['candidate_response'] = candidate_response
    elif interviewer_question:
        # Start a new exchange
        conversation_history.append({
            'interviewer_question': interviewer_question,
            'candidate_response': None
        })
    
    # Keep only the recent history
    if len(conversation_history) > settings.MAX_CONVERSATION_HISTORY:
        conversation_history = conversation_history[-settings.MAX_CONVERSATION_HISTORY:]

def clear_conversation_history():
    """Clear the conversation history (e.g., when starting a new interview)."""
    global conversation_history
    conversation_history = []

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
        print(f"❌ ERROR: Groq API key verification failed. Status: {e.status_code}, Message: {e.message}")
        return False
    except Exception as e:
        print(f"❌ ERROR: An unexpected error occurred while verifying Groq key: {e}")
        return False

def get_ai_answer(question: str, context: dict) -> str:
    """
    Gets an AI-generated answer for an interview question.
    Now provides full answers with dynamic length.
    """
    try:
        # Add the question to conversation history
        add_to_conversation_history(interviewer_question=question)
        
        client = Groq(api_key=settings.GROQ_API_KEY)
        
        # Determine if this needs full context or can use quick response
        is_complex = is_complex_question(question)
        use_full_context = is_complex and settings.PERSONALIZE_ANSWERS
        
        if use_full_context:
            prompt = get_interview_answer_prompt(question, context, conversation_history)
        else:
            prompt = get_quick_response_prompt(question, context)  # Pass context for basic personalization
        
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            model="llama3-8b-8192",  # Fast model
            temperature=0.4,  # Slightly higher for more natural responses
            # Remove restrictive token limits - let AI decide appropriate length
            # max_tokens=max_tokens,  # Commented out for dynamic length
            top_p=0.9,       # Allow for more creativity in full answers
        )
        
        answer = chat_completion.choices[0].message.content
        return answer.strip()
        
    except Exception as e:
        print(f"❌ ERROR: Could not get AI answer: {e}")
        return "I'm sorry, I couldn't generate a response at this time. Please try to answer based on your experience."

def process_candidate_response(response: str):
    """
    Process what the candidate said to add to conversation context.
    This helps the AI provide better future responses.
    """
    if settings.TRACK_CANDIDATE_RESPONSES and response.strip():
        add_to_conversation_history(candidate_response=response)
        print(f"📝 Conversation context updated with candidate response")

# Legacy function name for backward compatibility
def get_ai_suggestion(question: str, context: dict) -> str:
    """Legacy function - now redirects to get_ai_answer."""
    return get_ai_answer(question, context)