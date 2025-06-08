import json
from openai import AsyncOpenAI, APIStatusError
from core.config import settings
from core.prompts import get_interview_answer_prompt, get_quick_response_prompt
from typing import Dict, List, Optional

# --- LLMManager Class ---

class LLMManager:
    """
    Manages the connection and interaction with a specific OpenAI-compatible LLM provider.
    An instance of this class should be created for each interview session.
    """
    def __init__(self, provider_name: str, base_url: str, api_key: str, model_name: str):
        self.provider_name = provider_name
        self.model_name = model_name
        self.conversation_history: List[Dict] = []
        
        try:
            self.client = AsyncOpenAI(base_url=base_url, api_key=api_key)
            print(f"✅ LLMManager initialized for provider: {self.provider_name}")
        except Exception as e:
            self.client = None
            print(f"❌ CRITICAL: Failed to initialize LLMManager for {self.provider_name}: {e}")

    async def get_ai_answer(self, question: str, context: dict) -> str:
        """Gets an AI-generated answer for an interview question asynchronously."""
        if not self.client:
            return "I'm sorry, the AI service is not available at this time."

        try:
            print(f"🎯 PROCESSING QUESTION with {self.provider_name} ({self.model_name}): '{question}'")
            self._add_to_history(interviewer_question=question)
            
            if settings.PERSONALIZE_ANSWERS:
                prompt = get_interview_answer_prompt(question, context, self.conversation_history)
            else:
                prompt = get_quick_response_prompt(question, context)
                
            # Use the async client to make a non-blocking API call
            chat_completion = await self.client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model=self.model_name,
                temperature=0.5,
                top_p=0.8,
            )
            
            answer = chat_completion.choices[0].message.content
            return answer.strip()
            
        except Exception as e:
            print(f"❌ ERROR: Could not get AI answer from {self.provider_name}: {e}")
            return "I'm sorry, I couldn't generate a response. Please try again."

    def process_candidate_response(self, response: str):
        """Processes the candidate's response to add to conversation context."""
        if settings.TRACK_CANDIDATE_RESPONSES and response.strip():
            self._add_to_history(candidate_response=response)
            print("📝 Conversation context updated with candidate response")

    def clear_history(self):
        """Clears the conversation history for this session."""
        self.conversation_history = []

    def _add_to_history(self, interviewer_question: Optional[str] = None, candidate_response: Optional[str] = None):
        """Adds an exchange to the instance's conversation history."""
        if not settings.TRACK_CANDIDATE_RESPONSES:
            return
            
        if self.conversation_history and not self.conversation_history[-1].get('candidate_response') and candidate_response:
            self.conversation_history[-1]['candidate_response'] = candidate_response
        elif interviewer_question:
            self.conversation_history.append({
                'interviewer_question': interviewer_question,
                'candidate_response': None
            })
        
        if len(self.conversation_history) > settings.MAX_CONVERSATION_HISTORY:
            self.conversation_history = self.conversation_history[-settings.MAX_CONVERSATION_HISTORY:]

# --- Standalone Verification Function ---

async def verify_provider_connection(base_url: str, api_key: str, model_name: str) -> bool:
    """
    Verifies a connection to an AI provider without creating a full manager instance.
    Returns True if the connection is valid, False otherwise.
    """
    try:
        temp_client = AsyncOpenAI(base_url=base_url, api_key=api_key)
        # A lightweight call to check credentials and connectivity.
        # Note: Some providers might not list all models, but this is a good general check.
        await temp_client.models.list()
        print(f"✅ Connection to {base_url} with model {model_name} is valid.")
        return True
    except APIStatusError as e:
        print(f"❌ ERROR: API key verification failed for {base_url}. Status: {e.status_code}")
        return False
    except Exception as e:
        print(f"❌ ERROR: An unexpected error occurred during provider verification for {base_url}: {e}")
        return False