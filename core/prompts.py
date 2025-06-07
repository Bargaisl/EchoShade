# --- core/prompts.py ---
# Advanced AI prompt engineering system for interview coaching

from core.config import settings
from typing import Dict, List, Optional

def build_candidate_profile(context: dict) -> str:
    """Build a comprehensive candidate profile section for prompts."""
    if not settings.PERSONALIZE_ANSWERS:
        return ""
    
    profile_parts = []
    
    if context.get('name'):
        profile_parts.append(f"Candidate Name: {context['name']}")
    
    if context.get('company'):
        profile_parts.append(f"Target Company: {context['company']}")
    
    if context.get('role'):
        profile_parts.append(f"Target Role: {context['role']}")
    
    if context.get('focus') and len(context['focus']) > 0:
        focus_areas = ', '.join(context['focus'])
        profile_parts.append(f"Interview Focus Areas: {focus_areas}")
    
    if context.get('resume'):
        # Truncate resume for prompt efficiency
        resume_preview = context['resume'][:800] + "..." if len(context['resume']) > 800 else context['resume']
        profile_parts.append(f"Resume/Background:\n{resume_preview}")
    
    if context.get('objectives'):
        # Truncate job description for prompt efficiency
        job_preview = context['objectives'][:600] + "..." if len(context['objectives']) > 600 else context['objectives']
        profile_parts.append(f"Job Description/Requirements:\n{job_preview}")
    
    return "\n".join(profile_parts) + "\n" if profile_parts else ""

def build_conversation_context(conversation_history: List[Dict]) -> str:
    """Build conversation context from recent exchanges."""
    if not settings.INCLUDE_CONVERSATION_HISTORY or not conversation_history:
        return ""
    
    context_parts = ["Recent conversation context:"]
    
    # Take the last few exchanges
    recent_history = conversation_history[-settings.MAX_CONVERSATION_HISTORY:]
    
    for exchange in recent_history:
        if exchange.get('interviewer_question'):
            context_parts.append(f"INTERVIEWER: {exchange['interviewer_question']}")
        if exchange.get('candidate_response'):
            context_parts.append(f"CANDIDATE: {exchange['candidate_response']}")
    
    if len(context_parts) > 1:  # More than just the header
        return "\n".join(context_parts) + "\n"
    return ""

def get_interview_answer_prompt(question: str, context: dict, conversation_history: List[Dict] = None) -> str:
    """
    Generates a comprehensive prompt for full interview answers.
    
    Args:
        question: The question asked by the interviewer
        context: Candidate profile and job information
        conversation_history: Recent conversation exchanges
    
    Returns:
        A detailed prompt for generating complete interview answers
    """
    
    if conversation_history is None:
        conversation_history = []
    
    # Build the comprehensive prompt
    prompt_parts = []
    
    # System role
    prompt_parts.append("""You are an expert interview coach providing real-time assistance during a live job interview.
Your goal is to help the candidate give the best possible answer to the interviewer's question.""")
    
    # Candidate profile (if personalization is enabled)
    candidate_profile = build_candidate_profile(context)
    if candidate_profile:
        prompt_parts.append("CANDIDATE PROFILE:")
        prompt_parts.append(candidate_profile)
    
    # Conversation context (if available and enabled)
    conversation_context = build_conversation_context(conversation_history)
    if conversation_context:
        prompt_parts.append(conversation_context)
    
    # Current question
    prompt_parts.append(f"CURRENT INTERVIEWER QUESTION: \"{question}\"")
    
    # Instructions for response
    if settings.GENERATE_FULL_ANSWERS:
        prompt_parts.append("""
INSTRUCTIONS:
Provide a complete, professional answer that the candidate can use verbatim. The answer should:

1. DIRECTLY address the question asked
2. Be tailored to the candidate's background and the target role
3. Demonstrate relevant skills and experience from their resume
4. Use specific examples when possible
5. Show enthusiasm for the role and company
6. Be conversational and natural (avoid being overly formal)
7. Be concise but comprehensive (2-3 sentences for simple questions, longer for complex ones)

ANSWER FORMAT:
Provide ONLY the answer the candidate should give. Do NOT include phrases like "You should say" or "Suggest saying". 
Write as if you ARE the candidate speaking directly to the interviewer.

COMPLETE ANSWER:""")
    else:
        prompt_parts.append("""
INSTRUCTIONS:
Provide a brief suggestion or key talking points for answering this question.
Keep it concise and actionable.

SUGGESTION:""")
    
    return "\n".join(prompt_parts)

def get_quick_response_prompt(question: str, context: dict = None) -> str:
    """
    Generates a quick, simple prompt for basic questions when full context isn't needed.
    But still includes basic personalization if available.
    """
    # Basic personalization even for quick responses
    name = context.get('name', '') if context else ''
    role = context.get('role', '') if context else ''
    company = context.get('company', '') if context else ''
    
    personalization = ""
    if name and role and company:
        personalization = f"You are {name}, applying for {role} at {company}. "
    elif name and role:
        personalization = f"You are {name}, applying for {role}. "
    elif name:
        personalization = f"You are {name}. "
    
    return f"""Interview question: "{question}"

{personalization}Give a brief, professional answer (1-2 sentences max).

Answer:"""

def is_complex_question(question: str) -> bool:
    """
    Determines if a question requires the full context treatment or can use a quick response.
    """
    complex_indicators = [
        'tell me about', 'describe', 'explain', 'walk me through', 'give me an example',
        'how would you', 'what would you do', 'how do you handle', 'what is your experience',
        'why do you want', 'why should we hire', 'what are your', 'where do you see yourself',
        'introduction', 'introduce yourself', 'about yourself', 'background',
        'tell me', 'give me', 'share', 'walk through', 'brief intro'
    ]
    
    question_lower = question.lower()
    is_complex = any(indicator in question_lower for indicator in complex_indicators)
    
    return is_complex