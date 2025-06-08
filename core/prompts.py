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
    
    context_parts = ["Previous conversation exchanges (for context only):"]
    
    # Take the last few exchanges
    recent_history = conversation_history[-settings.MAX_CONVERSATION_HISTORY:]
    
    for i, exchange in enumerate(recent_history, 1):
        if exchange.get('interviewer_question'):
            context_parts.append(f"📝 Exchange {i} - INTERVIEWER: {exchange['interviewer_question']}")
        if exchange.get('candidate_response'):
            context_parts.append(f"   ↳ CANDIDATE RESPONSE: {exchange['candidate_response']}")
        context_parts.append("")  # Add spacing between exchanges
    
    if len(context_parts) > 1:  # More than just the header
        return "\n".join(context_parts)
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
    
    # System role with comprehensive technical instructions
    prompt_parts.append("""You are an expert interview coach providing real-time assistance during a live job interview.
Your goal is to help the candidate give the best possible answer to the interviewer's question.

COMPREHENSIVE TECHNICAL INTERVIEW GUIDELINES:

FOR CODING/ALGORITHM QUESTIONS:
- Start with brief problem understanding and clarification
- Provide intuitive explanation of the approach first
- Give at least 2 different solutions when applicable (brute force → optimized)
- Write clean, working code in the EXACT programming language specified
- Include time and space complexity analysis for each approach
- Explain the thought process and why you chose each approach
- Add comments in code for clarity
- Mention edge cases and how to handle them

FOR DATA STRUCTURES & ALGORITHMS (DSA):
- Explain which data structure/algorithm fits best and why
- Discuss trade-offs between different approaches
- Provide complexity analysis (Big O notation)
- Include implementation details and optimizations
- Mention real-world applications where this would be useful

FOR SYSTEM DESIGN QUESTIONS:
- Start with requirements gathering and clarification
- Design high-level architecture first, then dive into components
- Discuss scalability, reliability, and performance considerations
- Choose appropriate databases, caching strategies, load balancing
- Address bottlenecks and how to handle them
- Include technology stack recommendations with justifications
- Discuss monitoring, logging, and deployment strategies

FOR TECHNICAL Q&A/CONCEPTS:
- Provide clear, precise definitions
- Explain use cases and practical applications
- Compare with alternatives (pros/cons)
- Give real-world examples from your experience
- Mention best practices and common pitfalls
- Include relevant technologies and frameworks

FOR API DESIGN QUESTIONS:
- Follow RESTful principles and industry standards
- Design proper URL structure and HTTP methods
- Include request/response examples with JSON schemas
- Discuss authentication, authorization, and security
- Address versioning, rate limiting, and error handling
- Consider scalability and performance optimizations

FOR FRONTEND/BACKEND TECHNICAL QUESTIONS:
- Mention specific frameworks, libraries, and tools
- Discuss performance optimizations and best practices
- Include code examples when relevant
- Address cross-browser compatibility, responsive design (frontend)
- Discuss security, databases, and architecture patterns (backend)

GENERAL APPROACH:
- Always be authentic and use real experiences from the candidate's background
- Structure answers clearly with logical flow
- Be concise but comprehensive - avoid unnecessary fluff
- Show depth of knowledge while remaining practical
- Demonstrate problem-solving thinking process""")
    
    # Candidate profile (if personalization is enabled)
    candidate_profile = build_candidate_profile(context)
    if candidate_profile:
        prompt_parts.append("CANDIDATE PROFILE:")
        prompt_parts.append(candidate_profile)
    
    # Conversation context (if available and enabled) - CLEARLY MARKED AS CONTEXT ONLY
    conversation_context = build_conversation_context(conversation_history)
    if conversation_context:
        prompt_parts.append("=" * 80)
        prompt_parts.append("CONVERSATION HISTORY (FOR CONTEXT ONLY - DO NOT RE-ANSWER THESE):")
        prompt_parts.append(conversation_context)
        prompt_parts.append("=" * 80)
    
    # Current question - CLEARLY MARKED AS THE QUESTION TO ANSWER
    prompt_parts.append("🎯 CURRENT QUESTION TO ANSWER:")
    prompt_parts.append(f"\"{question}\"")
    
    # Final instructions - let AI intelligently handle question type based on system guidelines
    if settings.GENERATE_FULL_ANSWERS:
        prompt_parts.append("""
🎯 RESPONSE INSTRUCTIONS:
FOCUS ONLY ON THE CURRENT QUESTION ABOVE. The conversation history is provided for context only.

Based on the current question type, follow the appropriate guidelines above. Always:

- ANSWER ONLY THE CURRENT QUESTION - ignore any previous questions in the conversation history
- Use the candidate's REAL background, projects, and experience from their resume
- Be authentic and specific - don't make up fake scenarios
- Apply the technical guidelines automatically based on current question context
- Write as if you ARE the candidate speaking directly to the interviewer
- Be conversational yet professional
- If the current question builds on previous context, acknowledge it briefly but focus on what's being asked now

COMPLETE ANSWER TO THE CURRENT QUESTION:""")
    else:
        prompt_parts.append("""
🎯 BRIEF RESPONSE INSTRUCTIONS:
FOCUS ONLY ON THE CURRENT QUESTION ABOVE. Provide a concise, authentic answer based on the candidate's real background.

BRIEF ANSWER TO THE CURRENT QUESTION:""")
    
    return "\n".join(prompt_parts)

def get_quick_response_prompt(question: str, context: dict = None) -> str:
    """
    Generates a quick, simple prompt for basic questions with essential context.
    Now includes resume highlights to ensure AI knows about candidate's actual projects.
    """
    if not context:
        return f"""Interview question: "{question}"

Give a brief, professional answer.

Answer:"""
    
    # Essential candidate info
    name = context.get('name', '')
    role = context.get('role', '')
    company = context.get('company', '')
    resume = context.get('resume', '')
    
    # Build basic profile
    profile_parts = []
    if name and role and company:
        profile_parts.append(f"You are {name}, applying for {role} at {company}.")
    
    # Include key resume highlights (especially projects)
    if resume:
        # Extract project mentions and key skills for context
        resume_preview = resume[:1000] + "..." if len(resume) > 1000 else resume
        profile_parts.append(f"Key background: {resume_preview}")
    
    profile_context = "\n".join(profile_parts) if profile_parts else ""
    
    return f"""🎯 CURRENT INTERVIEW QUESTION TO ANSWER:
"{question}"

CANDIDATE PROFILE:
{profile_context}

🎯 INSTRUCTIONS:
Give a professional answer to the CURRENT QUESTION above. Draw from your actual background and projects. Be specific and authentic.

ANSWER TO THE CURRENT QUESTION:"""

# Removed manual question categorization - AI now handles this intelligently