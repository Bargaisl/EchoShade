import orjson
import asyncio
import base64
import threading
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
from openai import AsyncOpenAI, APIStatusError
from core.config import settings

class VisionManager:
    """Vision AI Manager for screenshot analysis and code problem solving"""
    
    def __init__(self, provider_name: str, base_url: str, api_key: str, model_name: str, request_params: Optional[Dict[str, Any]] = None, api_keys: Optional[List[str]] = None):
        self.provider_name = provider_name
        self.model_name = model_name
        self.base_url = base_url
        self.request_params = request_params or {}
        self.is_healthy = True
        self.last_error = None
        self.error_count = 0
        self.last_success_time = datetime.now()
        self.context_manager = None  # Will be set by VisionService
        
        # Key rotation support
        self.api_keys = api_keys if api_keys and len(api_keys) > 0 else [api_key]
        self.api_key = self.api_keys[0]
        self._key_index = 0
        self._key_lock = threading.Lock()
        self._request_count = 0
        
        try:
            self.client = AsyncOpenAI(base_url=base_url, api_key=self.api_key)
            print(f"✅ VisionManager initialized for: {self.provider_name} - {self.model_name} ({len(self.api_keys)} keys available)")
        except Exception as e:
            self.client = None
            self.is_healthy = False
            self.last_error = str(e)
            print(f"❌ CRITICAL: Failed to initialize VisionManager for {self.provider_name}: {e}")

    def _rotate_key(self):
        """Rotate to the next API key using round-robin."""
        if len(self.api_keys) <= 1:
            return
        with self._key_lock:
            self._key_index = (self._key_index + 1) % len(self.api_keys)
            self.api_key = self.api_keys[self._key_index]
            self.client = AsyncOpenAI(base_url=self.base_url, api_key=self.api_key)
            self._request_count += 1
            print(f"🔑 Vision key rotation [{self.provider_name}]: using key index {self._key_index}/{len(self.api_keys)}")

    def set_context_manager(self, context_manager):
        """Set the shared context manager"""
        self.context_manager = context_manager

    async def health_check(self) -> bool:
        """Check if the vision provider is healthy and responsive"""
        if not self.client:
            return False
            
        try:
            # Quick test call to verify connectivity
            await asyncio.wait_for(self.client.models.list(), timeout=5.0)
            self.is_healthy = True
            self.error_count = 0
            self.last_success_time = datetime.now()
            return True
        except asyncio.TimeoutError:
            self.is_healthy = False
            self.last_error = "Connection timeout"
            self.error_count += 1
            return False
        except Exception as e:
            self.is_healthy = False
            self.last_error = str(e)
            self.error_count += 1
            return False

    async def analyze_screenshots(self, prompt: str, screenshots: List[str], languages: List[str] = None, add_to_history: bool = True) -> Tuple[str, Dict[str, Any]]:
        """Analyze screenshots with instant key rotation on any error — zero delay retries."""
        if not self.client:
            return "I'm sorry, the vision AI service is not available at this time.", {
                "error": "No client available",
                "provider": self.provider_name,
                "model": self.model_name
            }
        
        # Prepare the message content with text and images (once, before retry loop)
        content = [{"type": "text", "text": prompt}]
        for i, screenshot_data_url in enumerate(screenshots):
            if not screenshot_data_url.startswith('data:image/'):
                screenshot_data_url = f"data:image/jpeg;base64,{screenshot_data_url}"
            content.append({
                "type": "image_url",
                "image_url": {"url": screenshot_data_url}
            })
        
        print(f"🔍 Analyzing {len(screenshots)} screenshots with {self.provider_name}-{self.model_name}")
        
        # Try all available keys — instant retry on any error
        max_attempts = len(self.api_keys)
        last_error = None
        
        for attempt in range(max_attempts):
            try:
                # Rotate key for each attempt (first attempt uses current key)
                if attempt > 0:
                    self._rotate_key()
                    print(f"🔄 Vision instant retry attempt {attempt+1}/{max_attempts} with next key for {self.provider_name}")
                
                # Build API params
                api_params = {
                    "messages": [{"role": "user", "content": content}],
                    "model": self.model_name,
                    "temperature": 0.45,
                    "max_tokens": 8100,
                    "top_p": 0.95
                }
 
                # Add provider-specific routing if available
                if self.request_params:
                    if self.provider_name == "OpenRouter" and "provider" in self.request_params:
                        api_params["extra_body"] = self.request_params
                    else:
                        api_params.update(self.request_params)
                
                # Make API call
                chat_completion = await asyncio.wait_for(
                    self.client.chat.completions.create(**api_params),
                    timeout=75.0
                )
                
                analysis = chat_completion.choices[0].message.content.strip()
                
                # Add vision analysis to conversation history if context manager available and requested
                if self.context_manager and add_to_history:
                    self.context_manager.add_ai_response(analysis, "vision")
                
                # Success!
                self.is_healthy = True
                self.error_count = 0
                self.last_success_time = datetime.now()
                
                return analysis, {
                    "success": True,
                    "provider": self.provider_name,
                    "model": self.model_name,
                    "key_rotated": attempt > 0,
                    "attempt": attempt + 1,
                    "screenshot_count": len(screenshots),
                    "languages": languages or [],
                    "response_time": datetime.now().isoformat(),
                    "analysis_length": len(analysis)
                }
                
            except Exception as e:
                last_error = e
                err_str = str(e)[:100]
                print(f"⚡ Vision key #{self._key_index} failed for {self.provider_name}: {err_str}")
                # Continue to next key immediately — no delay
                continue
        
        # All keys exhausted
        error_msg = f"All {max_attempts} vision keys failed for {self.provider_name}. Last error: {str(last_error)[:100]}"
        self.is_healthy = False
        self.last_error = str(last_error)
        self.error_count += 1
        print(f"🚨 ALL VISION KEYS EXHAUSTED: {self.provider_name}-{self.model_name}")
        
        return error_msg, {
            "error": "all_keys_failed",
            "attempts": max_attempts,
            "provider": self.provider_name,
            "model": self.model_name,
            "screenshot_count": len(screenshots)
        }

    def get_status(self) -> Dict[str, Any]:
        """Get current status of this vision manager"""
        return {
            "provider": self.provider_name,
            "model": self.model_name,
            "is_healthy": self.is_healthy,
            "error_count": self.error_count,
            "last_error": self.last_error,
            "last_success": self.last_success_time.isoformat() if self.last_success_time else None,
            "supports_vision": True
        }

class VisionService:
    """Service for managing vision analysis requests and providers"""
    
    def __init__(self):
        self.vision_managers: Dict[str, VisionManager] = {}
        self.active_vision_providers: Dict[str, VisionManager] = {}
        self.context_manager = None

    def set_context_manager(self, context_manager):
        """Set the shared context manager for all vision managers"""
        self.context_manager = context_manager
        # Update all existing vision managers
        for manager in self.vision_managers.values():
            manager.set_context_manager(context_manager)
        
    def load_vision_providers(self, primary_config: Optional[Dict] = None, secondary_config: Optional[Dict] = None) -> bool:
        """Load active vision providers based on user selection."""
        self.active_vision_providers = {}
        
        if primary_config and primary_config.get('provider') and primary_config.get('model'):
            manager = self._create_vision_manager(primary_config['provider'], primary_config['model'])
            if manager:
                self.active_vision_providers['primary'] = manager

        if secondary_config and secondary_config.get('provider') and secondary_config.get('model'):
            manager = self._create_vision_manager(secondary_config['provider'], secondary_config['model'])
            if manager:
                self.active_vision_providers['secondary'] = manager
        
        print(f"✅ VisionService configured with {len(self.active_vision_providers)} active vision models.")
        return len(self.active_vision_providers) > 0

    def _create_vision_manager(self, provider_name: str, model_name: str) -> Optional[VisionManager]:
        """Create and return a vision manager for a given provider and model."""
        try:
            with open("ai_providers.json", "rb") as f:
                providers_config = orjson.loads(f.read())

            for provider_config in providers_config:
                if provider_config["name"] == provider_name:
                    # Find the model configuration, supporting both string and dict formats
                    model_config = self._get_vision_model_config(provider_config, model_name)
                    
                    manager = VisionManager(
                        provider_name=provider_name,
                        base_url=provider_config["baseURL"],
                        api_key=provider_config.get("apiKey", provider_config.get("apiKeys", [""])[0]),
                        model_name=model_config["modelName"],
                        request_params=model_config.get("requestParams"),
                        api_keys=provider_config.get("apiKeys")
                    )
                    if self.context_manager:
                        manager.set_context_manager(self.context_manager)
                    return manager
            return None
        except Exception as e:
            print(f"❌ Failed to create vision manager for {provider_name}: {e}")
            return None

    def _get_vision_model_config(self, provider_config: Dict[str, Any], model_identifier: str) -> Dict[str, Any]:
        """Finds vision model configuration, supporting both string and dict formats."""
        for model in provider_config.get("visionModels", []):
            if isinstance(model, str) and model == model_identifier:
                return {"modelName": model}  # Normalize to dict
            if isinstance(model, dict) and model.get("modelName") == model_identifier:
                return model
        raise ValueError(f"Vision model '{model_identifier}' not found for provider '{provider_config['name']}'")
    
    def get_vision_manager(self, provider_name: str, model_name: str) -> Optional[VisionManager]:
        """Get a specific vision manager, checking active providers first."""
        # Check active providers first
        for key, manager in self.active_vision_providers.items():
            if manager.provider_name == provider_name and manager.model_name == model_name:
                return manager
        
        # Fallback to creating a new one if not found in active
        print(f"⚠️ Vision manager for {provider_name} - {model_name} not found in active providers. Creating on-the-fly.")
        return self._create_vision_manager(provider_name, model_name)
    
    async def analyze_coding_problem_ocr(self, provider_name: str, model_name: str, 
                                       screenshots: List[str], prompt: str) -> Tuple[str, Dict[str, Any]]:
        """Extract text/questions/code from screenshots using a vision model with minimal tokens"""
        vision_manager = self.get_vision_manager(provider_name, model_name)
        if not vision_manager:
            return f"Vision model {provider_name} - {model_name} not available.", {
                "error": "vision_model_not_found",
                "provider": provider_name,
                "model": model_name
            }
        
        # Perform vision analysis using the specific OCR extraction prompt, skipping history addition
        return await vision_manager.analyze_screenshots(prompt, screenshots, add_to_history=False)

    async def analyze_coding_problem(self, provider_name: str, model_name: str, 
                                   screenshots: List[str], languages: List[str] = None) -> Tuple[str, Dict[str, Any]]:
        """Analyze coding problem screenshots with comprehensive prompting"""
        
        vision_manager = self.get_vision_manager(provider_name, model_name)
        if not vision_manager:
            return f"Vision model {provider_name} - {model_name} not available.", {
                "error": "vision_model_not_found",
                "provider": provider_name,
                "model": model_name
            }
        
        # Generate comprehensive coding prompt
        prompt = self.generate_coding_analysis_prompt(languages)
        
        # Perform vision analysis
        return await vision_manager.analyze_screenshots(prompt, screenshots, languages)
    
    def generate_coding_analysis_prompt(self, languages: List[str] = None) -> str:
        """Generate a concise prompt in Russian for analyzing screenshots (MCQs, coding problems, math)"""
        primary_language = "Java"
        if languages and len(languages) > 0:
            programming_languages = [lang for lang in languages if lang.lower() != 'sql']
            if programming_languages:
                primary_language = programming_languages[0]

        return f"""Ты — ИИ-помощник для экзаменов и тестов.
Отвечай строго на РУССКОМ языке. Даже если текст на скриншоте на английском — пиши ответ по-русски.
Давай максимально краткий и прямой ответ без лишних слов, вступлений и эмодзи.

Определи тип контента на скриншотах и следуй правилам:

1. Если это тест с вариантами ответов (MCQ):
- Укажи текст вопроса или его краткую суть.
- Выведи ТОЛЬКО правильный вариант (буква и текст варианта).
- Дай краткое пояснение выбора в 1-2 предложения.
Пример:
Вопрос: [Краткая суть]
Правильный ответ: A) [Текст]
Пояснение: [1-2 предложения]

2. Если это задача по программированию или исправление кода с багами:
- Напиши ИСКЛЮЧИТЕЛЬНО готовый рабочий код в одном блоке ```{primary_language.lower()}.
- Код должен быть абсолютно правильным, эффективным и обрабатывать все крайние случаи.
- Под кодом укажи сложность одной строчкой (например: Time: O(n), Space: O(1)).
- Не пиши никаких текстовых вступлений, списков багов, описания ошибок или рассуждений вне блока кода. Только рабочий код. Ни одного лишнего слова за пределами блока кода!

3. Если это математическая/числовая задача:
- Покажи только краткую формулу/расчёт и ответ. Только суть.

4. Для терминов:
- Чёткое краткое определение и пример.
"""

    async def get_all_vision_status(self) -> Dict[str, Dict[str, Any]]:
        """Get status of all vision providers"""
        status = {}
        
        for manager_key, manager in self.vision_managers.items():
            try:
                # Perform health check
                is_healthy = await manager.health_check()
                status[manager_key] = manager.get_status()
                status[manager_key]["health_check_result"] = is_healthy
            except Exception as e:
                status[manager_key] = {
                    "provider": manager.provider_name,
                    "model": manager.model_name,
                    "is_healthy": False,
                    "error": str(e),
                    "health_check_result": False
                }
        
        return status

# Global vision service instance
vision_service = VisionService()

# Verification function
async def verify_vision_provider_connection(base_url: str, api_key: str, model_name: str, request_params: Optional[Dict[str, Any]] = None) -> bool:
    """Verify a vision provider connection - simplified to avoid complex vision tests"""
    try:
        temp_client = AsyncOpenAI(base_url=base_url, api_key=api_key)
        
        # Just test basic connectivity with models.list() - don't do complex vision tests
        await asyncio.wait_for(temp_client.models.list(), timeout=20.0)
        
        # For OpenRouter, note that we have provider routing but skip complex testing
        if request_params and "provider" in request_params:
            print(f"INFO: OpenRouter vision model {model_name} configured with provider routing: {request_params}")
            print(f"INFO: Skipping complex vision test - basic connectivity verified")
        
        print(f"✅ Vision connection to {base_url} with model {model_name} is valid.")
        return True
    except asyncio.TimeoutError:
        print(f"⏱️ TIMEOUT: Vision connection to {base_url} timed out")
        return False
    except APIStatusError as e:
        print(f"❌ ERROR: Vision API key verification failed for {base_url}. Status: {e.status_code}")
        return False
    except Exception as e:
        print(f"❌ ERROR: Vision provider verification error for {base_url}: {e}")
        return False