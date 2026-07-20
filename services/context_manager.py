from datetime import datetime
from core.config import settings
import re

def filter_thinking_content(content: str) -> str:
    """Filter out thinking content enclosed in <think> tags from AI responses."""
    if not content or not isinstance(content, str):
        return content
    
    # Remove content between <think> and </think> tags (case insensitive, multiline)
    thinking_regex = r'<think\s*>[\s\S]*?</think\s*>'
    filtered_content = re.sub(thinking_regex, '', content, flags=re.IGNORECASE)
    
    # Clean up any extra whitespace or newlines left behind
    filtered_content = re.sub(r'\n\s*\n\s*\n', '\n\n', filtered_content).strip()
    
    return filtered_content

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
            'exam_materials': '',         # EXAM CHEAT SHEET
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
            'exam_materials': onboarding_data.get('examMaterials', ''),  # CHEAT SHEET
            'focus_areas': onboarding_data.get('focus', []),
            'created_at': datetime.now().isoformat()
        })
        self.is_initialized = True
        print(f"✅ Persistent context initialized with full resume ({len(self.persistent_context['complete_resume'])} chars)")
    
    def add_conversation_exchange(self, interviewer_question: str, candidate_response: str = None, ai_response: str = None):
        """Add conversation exchange - limited to MAX_CONVERSATION_HISTORY most recent"""
        
        # Filter thinking content from AI response
        filtered_ai_response = filter_thinking_content(ai_response) if ai_response else ai_response
        
        exchange = {
            'interviewer_question': interviewer_question,
            'candidate_response': candidate_response,
            'ai_response': filtered_ai_response,
            'timestamp': datetime.now().isoformat()
        }
        
        # If we are only getting a candidate response, add it to the last exchange.
        if interviewer_question is None and candidate_response and self.conversation_history:
            self.conversation_history[-1]['candidate_response'] = candidate_response
        # If we are only getting an AI response, add it to the last exchange.
        elif interviewer_question is None and ai_response and self.conversation_history:
            self.conversation_history[-1]['ai_response'] = filtered_ai_response
        else:
            self.conversation_history.append(exchange)

        # Keep only last MAX_CONVERSATION_HISTORY exchanges
        max_history = settings.MAX_CONVERSATION_HISTORY
        if len(self.conversation_history) > max_history:
            self.conversation_history = self.conversation_history[-max_history:]
    
    def add_ai_response(self, ai_response: str, response_type: str = "normal", model: str = None, provider: str = None):
        """Add AI response to conversation history"""
        # Prefix vision analysis responses to distinguish them
        if response_type == "vision":
            ai_response = f"[VISION ANALYSIS] {ai_response}"
        
        # Filter out thinking content
        filtered_ai_response = filter_thinking_content(ai_response)
        
        # Add to the last exchange if it exists, otherwise create a new one
        if self.conversation_history:
            self.conversation_history[-1]['ai_response'] = filtered_ai_response
            if model:
                self.conversation_history[-1]['model'] = model
            if provider:
                self.conversation_history[-1]['provider'] = provider
        else:
            # Create a new exchange with just the AI response
            exchange = {
                'interviewer_question': None,
                'candidate_response': None,
                'ai_response': filtered_ai_response,
                'timestamp': datetime.now().isoformat(),
                'model': model,
                'provider': provider
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

    def reset_conversation_history(self):
        """Resets the conversation history."""
        self.conversation_history = []
        print("🔄 Conversation history reset")

    def get_relevant_materials(self, query_text: str, max_paragraphs: int = 3) -> str:
        """Locally search exam cheat sheet using layout/language-independent Jaccard overlap similarity"""
        materials = self.persistent_context.get('exam_materials', '')
        if not materials or not materials.strip():
            return ""
        
        # Split into blocks by double newlines first
        blocks = [b.strip() for b in materials.split('\n\n') if b.strip()]
        # Fallback to single newlines if only one block but linebreaks exist
        if len(blocks) <= 1 and '\n' in materials:
            blocks = [b.strip() for b in materials.split('\n') if b.strip()]
            
        if not blocks:
            return ""
        
        # Tokenize query
        import re
        def tokenize(text):
            return set(re.findall(r'\w+', text.lower()))
            
        query_tokens = tokenize(query_text)
        if not query_tokens:
            return ""
            
        scored_blocks = []
        for block in blocks:
            block_tokens = tokenize(block)
            if not block_tokens:
                continue
            # Calculate Jaccard Similarity
            intersection = query_tokens.intersection(block_tokens)
            if intersection:
                union = query_tokens.union(block_tokens)
                score = len(intersection) / len(union)
                scored_blocks.append((score, block))
                
        if not scored_blocks:
            return ""
            
        # Sort by relevance score
        scored_blocks.sort(key=lambda x: x[0], reverse=True)
        top_blocks = [block for score, block in scored_blocks[:max_paragraphs]]
        
        print(f"🔍 RAG: Found {len(top_blocks)} matching blocks in cheat sheet. Top score: {scored_blocks[0][0]:.3f}")
        return "\n\n---\n\n".join(top_blocks)
