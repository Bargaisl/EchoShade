# --- core/prompts.py ---
# Advanced AI prompt engineering system for interview coaching

from core.config import settings
from typing import Dict, List, Optional

from services.context_manager import PersistentContextManager

def build_unlimited_candidate_profile(persistent_context: dict) -> str:
    """Build comprehensive candidate profile with UNLIMITED content."""
    profile_parts = []
    
    if persistent_context.get('candidate_name'):
        profile_parts.append(f"Candidate Name: {persistent_context['candidate_name']}")
    
    if persistent_context.get('target_company'):
        profile_parts.append(f"Target Company: {persistent_context['target_company']}")
    
    if persistent_context.get('target_role'):
        profile_parts.append(f"Target Role: {persistent_context['target_role']}")
    
    if persistent_context.get('focus_areas'):
        focus_areas = ', '.join(persistent_context['focus_areas'])
        profile_parts.append(f"Interview Focus Areas: {focus_areas}")
    
    # UNLIMITED: Complete resume content
    if persistent_context.get('complete_resume'):
        profile_parts.append(f"COMPLETE RESUME/BACKGROUND:\n{persistent_context['complete_resume']}")
    
    # UNLIMITED: Complete job description
    if persistent_context.get('complete_job_description'):
        profile_parts.append(f"COMPLETE JOB DESCRIPTION/REQUIREMENTS:\n{persistent_context['complete_job_description']}")
    
    return "\n".join(profile_parts) + "\n" if profile_parts else ""

def get_interview_answer_prompt(question: str, context_manager: PersistentContextManager) -> str:
    """
    Generate AI prompt with guaranteed persistent context + recent conversation history.
    NO TOKEN LIMITS - includes complete resume and job description.
    """
    
    complete_context = context_manager.get_complete_context()
    persistent_context = complete_context['persistent']
    conversation_history = complete_context['conversation_history']
    
    prompt_parts = []
    
    # System role instructions
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
    
    # PERSISTENT CANDIDATE CONTEXT - Always present, never removed
    prompt_parts.append("=" * 100)
    prompt_parts.append("🔒 PERSISTENT CANDIDATE CONTEXT (ALWAYS PRESENT - NEVER REMOVED):")
    prompt_parts.append(build_unlimited_candidate_profile(persistent_context))
    prompt_parts.append("=" * 100)
    
    # Recent conversation history (limited to MAX_CONVERSATION_HISTORY exchanges)
    if conversation_history:
        prompt_parts.append(f"📝 RECENT CONVERSATION HISTORY (LAST {settings.MAX_CONVERSATION_HISTORY} EXCHANGES FOR CONTEXT):")
        for i, exchange in enumerate(conversation_history, 1):
            if exchange.get('interviewer_question'):
                prompt_parts.append(f"Exchange {i} - INTERVIEWER: {exchange['interviewer_question']}")
            if exchange.get('candidate_response'):
                prompt_parts.append(f"           ↳ CANDIDATE: {exchange['candidate_response']}")
            if exchange.get('ai_response'):
                # Truncate very long AI responses for context (keep first 500 chars)
                ai_response = exchange['ai_response']
                if len(ai_response) > 500:
                    ai_response = ai_response[:500] + "... [truncated for context]"
                prompt_parts.append(f"           ↳ AI ASSISTANT: {ai_response}")
            prompt_parts.append("")
        prompt_parts.append("=" * 100)
    
    # Current question to answer
    prompt_parts.append("🎯 CURRENT QUESTION TO ANSWER:")
    prompt_parts.append(f'"{question}"')
    
    # Instructions
    prompt_parts.append("""
🎯 RESPONSE INSTRUCTIONS:
- FOCUS ONLY ON THE CURRENT QUESTION ABOVE
- Use the COMPLETE candidate background from the persistent context only if required (full resume and job description)
- The conversation history is for context only - don't re-answer previous questions
- Be authentic and specific using the candidate's REAL experience and projects
- Write as if you ARE the candidate speaking directly to the interviewer

COMPLETE ANSWER TO THE CURRENT QUESTION:""")
    
    return "\n".join(prompt_parts)

def get_quick_response_prompt(question: str, context_manager: PersistentContextManager) -> str:
    """
    Generates a quick, simple prompt for basic questions with essential context.
    Uses the persistent context manager to access full candidate data.
    """
    if not context_manager or not context_manager.ensure_context_available():
        return f"""Interview question: "{question}"

Give a brief, professional answer.

Answer:"""
    
    persistent_context = context_manager.get_complete_context()['persistent']
    
    # Build basic profile from persistent context
    profile_parts = []
    name = persistent_context.get('candidate_name', '')
    role = persistent_context.get('target_role', '')
    company = persistent_context.get('target_company', '')
    resume = persistent_context.get('complete_resume', '')

    if name and role and company:
        profile_parts.append(f"You are {name}, applying for {role} at {company}.")
    
    # Include key resume highlights (a snippet for quick reference)
    if resume:
        resume_preview = resume[:1200] + "..." if len(resume) > 1200 else resume
        profile_parts.append(f"Key background highlights: {resume_preview}")
    
    profile_context = "\n".join(profile_parts) if profile_parts else ""
    
    return f"""🎯 CURRENT INTERVIEW QUESTION TO ANSWER:
"{question}"

CANDIDATE PROFILE:
{profile_context}

🎯 INSTRUCTIONS:
Give a professional, brief answer to the CURRENT QUESTION above. Draw from your actual background and projects. Be specific and authentic.

BRIEF ANSWER TO THE CURRENT QUESTION:"""

# Removed manual question categorization - AI now handles this intelligently