from datetime import datetime
from core.config import settings

class PersistentContextManager:
    """
    Manages persistent candidate context that is ALWAYS present in AI prompts.
    No token limits - includes complete resume and job description.
    """
    
    def __init__(self):
        self.persistent_context = {
            'candidate_name': '',
            'target_company': '',
            'target_role': '',
            'complete_resume': '',        # UNLIMITED - Full resume
            'complete_job_description': '',  # UNLIMITED - Full job description
            'focus_areas': [],
            'additional_context': {},
            'created_at': None
        }
        self.conversation_history = []  # Limited to MAX_CONVERSATION_HISTORY exchanges
        self.is_initialized = False
    
    def initialize_persistent_context(self, onboarding_data: dict):
        """Initialize persistent context from onboarding data - called once per interview"""
        self.persistent_context.update({
            'candidate_name': onboarding_data.get('name', ''),
            'target_company': onboarding_data.get('company', ''),
            'target_role': onboarding_data.get('role', ''),
            'complete_resume': onboarding_data.get('resume', ''),  # FULL CONTENT
            'complete_job_description': onboarding_data.get('objectives', ''),  # FULL CONTENT
            'focus_areas': onboarding_data.get('focus', []),
            'created_at': datetime.now().isoformat()
        })
        self.is_initialized = True
        print(f"✅ Persistent context initialized with full resume ({len(self.persistent_context['complete_resume'])} chars)")
    
    def add_conversation_exchange(self, interviewer_question: str, candidate_response: str = None, ai_response: str = None):
        """Add conversation exchange - limited to MAX_CONVERSATION_HISTORY most recent"""
        exchange = {
            'interviewer_question': interviewer_question,
            'candidate_response': candidate_response,
            'ai_response': ai_response,
            'timestamp': datetime.now().isoformat()
        }
        
        # If we are only getting a candidate response, add it to the last exchange.
        if interviewer_question is None and candidate_response and self.conversation_history:
            self.conversation_history[-1]['candidate_response'] = candidate_response
        # If we are only getting an AI response, add it to the last exchange.
        elif interviewer_question is None and ai_response and self.conversation_history:
            self.conversation_history[-1]['ai_response'] = ai_response
        else:
            self.conversation_history.append(exchange)

        # Keep only last MAX_CONVERSATION_HISTORY exchanges
        max_history = settings.MAX_CONVERSATION_HISTORY
        if len(self.conversation_history) > max_history:
            self.conversation_history = self.conversation_history[-max_history:]
    
    def add_ai_response(self, ai_response: str, response_type: str = "normal"):
        """Add AI response to conversation history"""
        # Prefix vision analysis responses to distinguish them
        if response_type == "vision":
            ai_response = f"[VISION ANALYSIS] {ai_response}"
        
        # Add to the last exchange if it exists, otherwise create a new one
        if self.conversation_history:
            self.conversation_history[-1]['ai_response'] = ai_response
        else:
            # Create a new exchange with just the AI response
            exchange = {
                'interviewer_question': None,
                'candidate_response': None,
                'ai_response': ai_response,
                'timestamp': datetime.now().isoformat()
            }
            self.conversation_history.append(exchange)
        
        # Keep only last MAX_CONVERSATION_HISTORY exchanges
        max_history = settings.MAX_CONVERSATION_HISTORY
        if len(self.conversation_history) > max_history:
            self.conversation_history = self.conversation_history[-max_history:]
        
        print(f"✅ AI response added to conversation history (type: {response_type}, total exchanges: {len(self.conversation_history)})")
    
    def get_complete_context(self) -> dict:
        """Return complete context - persistent + conversation history"""
        return {
            'persistent': self.persistent_context,
            'conversation_history': self.conversation_history,
            'context_stats': {
                'resume_length': len(self.persistent_context['complete_resume']),
                'job_desc_length': len(self.persistent_context['complete_job_description']),
                'conversation_exchanges': len(self.conversation_history),
                'is_initialized': self.is_initialized
            }
        }
    
    def ensure_context_available(self) -> bool:
        """Verify persistent context is properly initialized"""
        return self.is_initialized and bool(self.persistent_context.get('candidate_name'))