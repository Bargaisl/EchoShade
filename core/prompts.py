# --- core/prompts.py ---
# This module centralizes all AI prompt engineering.

def get_interview_suggestion_prompt(question: str, context: dict) -> str:
    """
    Generates a concise prompt for fast AI responses.
    
    Args:
        question: The question asked by the interviewer.
        context: A dictionary containing 'resume', 'job_description', etc.
    
    Returns:
        A short, focused prompt string.
    """
    
    # Short, focused prompt for speed
    prompt = f"""Interview question: "{question}"

Give a brief, actionable answer suggestion (1-2 sentences max).

Focus on:
- Professional tone
- Relevant experience
- Confidence

Answer:"""
    return prompt.strip()