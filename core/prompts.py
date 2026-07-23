# --- core/prompts.py ---
# Advanced AI prompt engineering system for interview coaching

from core.config import settings
from typing import Dict, List, Optional
from services.context_manager import PersistentContextManager

def build_unlimited_candidate_profile(persistent_context: dict) -> str:
    """Build comprehensive candidate profile with UNLIMITED content."""
    if not getattr(settings, 'PERSONALIZE_ANSWERS', True) or getattr(settings, 'MINIMAL_CONSUMPTION', False):
        return ""
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
    
    # Complete resume content
    if persistent_context.get('complete_resume'):
        profile_parts.append(f"COMPLETE RESUME/BACKGROUND:\n{persistent_context['complete_resume']}")
    
    # Complete job description
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
    is_minimal = getattr(settings, 'MINIMAL_CONSUMPTION', False)
    
    if is_minimal:
        # Сверхкороткая инструкция для максимальной экономии токенов
        prompt_parts.append("""Ты — ИИ-помощник для экзаменов и тестов.
Отвечай строго на РУССКОМ языке (если задание не требует перевода на другой язык).
Давай максимально краткий и прямой ответ без лишних слов, вступлений и эмодзи.
- Если перед тобой тест с вариантами ответов (тест) — выведи ТОЛЬКО правильный вариант (буква и текст) и пояснение в 1 предложение.
- Если перед тобой практическая задача по программированию (написать функцию, алгоритм, класс, SQL-запрос) или исправление кода с багами — напиши ИСКЛЮЧИТЕЛЬНО готовый рабочий код в одном блоке ```. Убедись в 100% логической правильности алгоритма, корректно обработай все крайние случаи и тщательно продумай управление состоянием. Ни одного слова за пределами блока кода!
- Если перед тобой задание на перевод текста, пересказ или написание ответа — выведи ИСКЛЮЧИТЕЛЬНО точный выполненный перевод/текст задачи без мета-пояснений, рассуждений и отказов.
- Если математическая/числовая задача — покажи краткую формулу/код и ответ. Только суть.""")
    else:
        # Стандартная инструкция
        prompt_parts.append("""Ты — ИИ-помощник для экзаменов и тестов.
Отвечай ТОЛЬКО на РУССКОМ языке (если прямо не требуется перевод на другой язык).
Ответы давай КОРОТКИЕ и по существу. Без лишней воды.
- Если это тест с вариантами ответов — дай правильный ответ и пояснение в 1–2 предложения.
- Если это практическая задача по программированию (написать код, функцию, алгоритм, SQL-запрос) или исправление кода с багами — напиши ПОЛНЫЙ РАБОЧИЙ ГОТОВЫЙ КОД в блоке разметки ``` и краткую сложность (Time/Space Complexity) одной строчкой под ним. Без разбора ошибок и пояснений.
- Если перед тобой задание на перевод текста, переформулирование или составление текста — выведи ИСКЛЮЧИТЕЛЬНО точный готовый перевод/текст без вступительных фраз и мета-комментариев.
- Для числовых/математических задач давай формулу, расчёт и ответ.
- Для терминов — чёткое определение и пример.
- Не используй длинные шаблоны и эмодзи.
- Будь полезным, быстрым и точным.""")
    
    # Короткий контекст кандидата
    profile = build_unlimited_candidate_profile(persistent_context)
    if profile:
        prompt_parts.append("=" * 40)
        prompt_parts.append("🔒 КОНТЕКСТ КАНДИДАТА:")
        prompt_parts.append(profile)
        prompt_parts.append("=" * 40)
    
    # История (если включена)
    if conversation_history and settings.INCLUDE_CONVERSATION_HISTORY:
        max_history = 2 if is_minimal else settings.MAX_CONVERSATION_HISTORY
        prompt_parts.append(f"📝 ИСТОРИЯ (последние {max_history} обменов):")
        for exchange in conversation_history[-max_history:]:
            if exchange.get('interviewer_question'):
                prompt_parts.append(f"В: {exchange['interviewer_question']}")
            if exchange.get('ai_response'):
                prompt_parts.append(f"О: {exchange['ai_response']}")
        prompt_parts.append("=" * 40)
    
    # Текущий вопрос
    prompt_parts.append("🎯 ВОПРОС:")
    prompt_parts.append(f'"{question}"')
    
    if is_minimal:
        prompt_parts.append("""
📌 ДАЙ ПРЯМОЙ ВЫПОЛНЕННЫЙ ОТВЕТ.
Если это тест — ТОЛЬКО выбранный вариант и пояснение в 1 предложение.
Если это написание/исправление кода — выдай ИСКЛЮЧИТЕЛЬНО готовый рабочий код (внутри ```) без текста до/после.
Если это перевод/текстовое задание — выдай ТОЛЬКО готовый перевод/текст ответа без мета-рассуждений.
БЕЗ ЭМОДЗИ.
""")
    else:
        prompt_parts.append("""
📌 ОТВЕТЬ КОРОТКО, ЧЁТКО, ТОЛЬКО ПО ДЕЛУ.
Если вопрос с вариантами — дай правильный ответ и пояснение в 1–2 предложения.
Если задача на программирование/исправление кода — напиши ИСКЛЮЧИТЕЛЬНО готовый рабочий код в блоке разметки ``` и краткую сложность.
Если это перевод текста — выведи ИСКЛЮЧИТЕЛЬНО готовый перевод без вступлений.
Не пиши длинные вступления, не используй эмодзи и сложное форматирование.
Только суть.
""")
    
    return "\n".join(prompt_parts)

def get_quick_response_prompt(question: str, context_manager: PersistentContextManager) -> str:
    """
    Generates a quick, simple prompt for basic questions with essential context.
    Uses the persistent context manager to access full candidate data.
    """
    complete_context = context_manager.get_complete_context()
    persistent_context = complete_context['persistent']
    
    prompt_parts = []
    is_minimal = getattr(settings, 'MINIMAL_CONSUMPTION', False)
    
    if is_minimal:
        prompt_parts.append("""Ты — ИИ-помощник для экзаменов и тестов.
Отвечай строго на РУССКОМ языке.
Давай максимально краткий и прямой ответ без лишних слов, вступлений и эмодзи.
Если это вопрос с вариантами ответов (тест) — выведи ТОЛЬКО правильный вариант (буква и текст) и пояснение в 1 предложение.
Если задача — покажи только краткую формулу/код и ответ. Только суть.""")
    else:
        prompt_parts.append("""Ты — ИИ-помощник для экзаменов и тестов.
Отвечай ТОЛЬКО на РУССКОМ языке. Даже если вопрос на английском — отвечай по-русски.
Ответы давай КОРОТКИЕ и по существу. Без лишней воды.
Для числовых/математических задач давай формулу, расчёт и ответ.
Для терминов — чёткое определение и пример.
Не используй длинные шаблоны и эмодзи.
Будь полезным, быстрым и точным.""")
        
    profile = build_unlimited_candidate_profile(persistent_context)
    if profile:
        prompt_parts.append("=" * 40)
        prompt_parts.append("🔒 КОНТЕКСТ КАНДИДАТА:")
        prompt_parts.append(profile)
        prompt_parts.append("=" * 40)
        
    prompt_parts.append("🎯 ВОПРОС:")
    prompt_parts.append(f'"{question}"')
    
    if is_minimal:
        prompt_parts.append("📌 ДАЙ МАКСИМАЛЬНО КРАТКИЙ ОТВЕТ НА РУССКОМ. ТОЛЬКО СУТЬ. БЕЗ ЭМОДЗИ.")
    else:
        prompt_parts.append("📌 ОТВЕТЬ КОРОТКО, ЧЁТКО, ТОЛЬКО ПО ДЕЛУ, НА РУССКОМ.")
        
    return "\n".join(prompt_parts)