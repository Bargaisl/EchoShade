import json
import asyncio
import base64
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
from openai import AsyncOpenAI, APIStatusError
from core.config import settings

class VisionManager:
    """Vision AI Manager for screenshot analysis and code problem solving"""
    
    def __init__(self, provider_name: str, base_url: str, api_key: str, model_name: str):
        self.provider_name = provider_name
        self.model_name = model_name
        self.base_url = base_url
        self.api_key = api_key
        self.is_healthy = True
        self.last_error = None
        self.error_count = 0
        self.last_success_time = datetime.now()
        
        try:
            self.client = AsyncOpenAI(base_url=base_url, api_key=api_key)
            print(f"✅ VisionManager initialized for: {self.provider_name} - {self.model_name}")
        except Exception as e:
            self.client = None
            self.is_healthy = False
            self.last_error = str(e)
            print(f"❌ CRITICAL: Failed to initialize VisionManager for {self.provider_name}: {e}")

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

    async def analyze_screenshots(self, prompt: str, screenshots: List[str], languages: List[str] = None) -> Tuple[str, Dict[str, Any]]:
        """Analyze screenshots with vision AI and provide comprehensive coding assistance"""
        if not self.client:
            return "I'm sorry, the vision AI service is not available at this time.", {
                "error": "No client available",
                "provider": self.provider_name,
                "model": self.model_name
            }
        
        try:
            # Prepare the message content with text and images
            content = [{"type": "text", "text": prompt}]
            
            # Add screenshots to the content
            for i, screenshot_data_url in enumerate(screenshots):
                # Ensure proper data URL format
                if not screenshot_data_url.startswith('data:image/'):
                    screenshot_data_url = f"data:image/jpeg;base64,{screenshot_data_url}"
                
                content.append({
                    "type": "image_url",
                    "image_url": {"url": screenshot_data_url}
                })
            
            print(f"🔍 Analyzing {len(screenshots)} screenshots with {self.provider_name}-{self.model_name}")
            
            # Make API call with timeout
            chat_completion = await asyncio.wait_for(
                self.client.chat.completions.create(
                    messages=[{
                        "role": "user", 
                        "content": content
                    }],
                    model=self.model_name,
                    temperature=0.4,  # Lower temperature for more focused analysis
                    max_tokens=8000,
                    top_p=0.9
                ),
                timeout=60.0  # 60 second timeout for vision analysis
            )
            
            analysis = chat_completion.choices[0].message.content.strip()
            
            # Update health status
            self.is_healthy = True
            self.error_count = 0
            self.last_success_time = datetime.now()
            
            return analysis, {
                "success": True,
                "provider": self.provider_name,
                "model": self.model_name,
                "screenshot_count": len(screenshots),
                "languages": languages or [],
                "response_time": datetime.now().isoformat(),
                "analysis_length": len(analysis)
            }
            
        except asyncio.TimeoutError:
            error_msg = f"Vision analysis timeout for {self.provider_name}. The request took too long to process."
            self.is_healthy = False
            self.last_error = "Request timeout"
            self.error_count += 1
            print(f"⏱️ TIMEOUT: {self.provider_name}-{self.model_name} vision analysis timed out")
            
            return error_msg, {
                "error": "timeout",
                "provider": self.provider_name,
                "model": self.model_name,
                "screenshot_count": len(screenshots)
            }
            
        except APIStatusError as e:
            error_msg = f"Vision API error from {self.provider_name}: {e.message}"
            self.is_healthy = False
            self.last_error = f"API Error: {e.status_code} - {e.message}"
            self.error_count += 1
            print(f"🚨 API ERROR: {self.provider_name}-{self.model_name}: {e.status_code} - {e.message}")
            
            return error_msg, {
                "error": "api_error",
                "status_code": e.status_code,
                "provider": self.provider_name,
                "model": self.model_name,
                "screenshot_count": len(screenshots)
            }
            
        except Exception as e:
            error_msg = f"Unexpected error during vision analysis with {self.provider_name}. Please try again."
            self.is_healthy = False
            self.last_error = str(e)
            self.error_count += 1
            print(f"❌ UNEXPECTED ERROR: {self.provider_name}-{self.model_name} vision analysis: {e}")
            
            return error_msg, {
                "error": "unexpected_error",
                "message": str(e),
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
        
    def load_vision_providers(self) -> bool:
        """Load available vision providers from configuration"""
        try:
            with open("ai_providers.json", "r") as f:
                providers_config = json.load(f)
            
            vision_providers_loaded = 0
            
            for provider_config in providers_config:
                if provider_config.get("supportsVision") and provider_config.get("visionModels"):
                    provider_name = provider_config["name"]
                    
                    # Create vision managers for each vision model
                    for model_name in provider_config["visionModels"]:
                        manager_key = f"{provider_name}_{model_name}"
                        
                        self.vision_managers[manager_key] = VisionManager(
                            provider_name=provider_name,
                            base_url=provider_config["baseURL"],
                            api_key=provider_config["apiKey"],
                            model_name=model_name
                        )
                        vision_providers_loaded += 1
            
            print(f"✅ VisionService initialized with {vision_providers_loaded} vision models")
            return vision_providers_loaded > 0
            
        except Exception as e:
            print(f"❌ CRITICAL: Failed to load vision providers: {e}")
            return False
    
    def get_vision_manager(self, provider_name: str, model_name: str) -> Optional[VisionManager]:
        """Get a specific vision manager"""
        manager_key = f"{provider_name}_{model_name}"
        return self.vision_managers.get(manager_key)
    
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
        """Generate a comprehensive prompt for coding problem analysis"""
        
        language_context = ""
        if languages and len(languages) > 0:
            primary_language = languages[0]
            other_languages = languages[1:] if len(languages) > 1 else []
            
            language_context = f"**Primary Language**: {primary_language}\n"
            if other_languages:
                language_context += f"**Alternative Languages**: {', '.join(other_languages)}\n"
        else:
            language_context = "**Languages**: Use Python as primary, but mention alternatives\n"
        
        return f"""You are an expert coding interview assistant and competitive programming mentor. I'm providing you with multiple screenshots that may contain:
- A coding problem statement
- Input/output examples  
- Constraints and requirements
- Additional context or hints

**IMPORTANT**: Analyze ALL screenshots together as ONE COMPLETE problem. If multiple screenshots show the same problem from different angles, consolidate the information. If they show different parts of the same problem, combine them into a comprehensive understanding.

{language_context}

## Complete Analysis Framework

Please provide a **single, comprehensive analysis** that covers ALL information from ALL screenshots:

### 🎯 **1. Complete Problem Understanding**
- **Full Problem Statement**: Consolidate all information from all screenshots
- **Input/Output Specifications**: Complete format from all sources
- **All Constraints**: Every constraint mentioned across screenshots
- **Edge Cases**: Comprehensive list from all sources
- **Additional Context**: Any hints, examples, or notes from any screenshot

### 🧠 **2. Multiple Solution Approaches**
Provide **TWO DISTINCT APPROACHES** with complete analysis:

#### **Approach 1: [Name the approach]**
- **Algorithm**: Detailed explanation
- **Intuition**: Why this works
- **Time Complexity**: With detailed analysis
- **Space Complexity**: With memory breakdown
- **Advantages**: When to use this approach

#### **Approach 2: [Name the alternative approach]** 
- **Algorithm**: Different strategy/technique
- **Intuition**: Alternative way of thinking
- **Time Complexity**: Compare with first approach
- **Space Complexity**: Compare memory usage  
- **Advantages**: When this approach is better

### 💻 **3. Complete Implementations**

#### **Solution 1 Implementation ({primary_language if languages else 'Python'})**
```{languages[0] if languages else 'python'}
# Provide complete, production-ready code for Approach 1
# Include detailed comments explaining each step
# Use meaningful variable names
# Handle edge cases properly
```

#### **Solution 2 Implementation ({primary_language if languages else 'Python'})**  
```{languages[0] if languages else 'python'}
# Provide complete, production-ready code for Approach 2
# Show the alternative implementation approach
# Include comprehensive comments
# Demonstrate different algorithmic thinking
```

### 🔍 **4. Detailed Walkthroughs**
- **Approach 1 Walkthrough**: Step-by-step with concrete examples
- **Approach 2 Walkthrough**: Alternative solution flow
- **Comparison**: When to choose which approach

### 🧪 **5. Comprehensive Testing**
- **Test Case Analysis**: Cover all examples from screenshots
- **Edge Case Testing**: Handle boundary conditions
- **Performance Validation**: Verify complexity claims
- **Debug Strategies**: Common pitfalls to avoid

### 🎤 **6. Interview Excellence**
- **Presentation Strategy**: How to discuss both approaches
- **Thought Process**: How to arrive at solutions naturally
- **Time Management**: Which approach to implement first
- **Follow-up Handling**: Expected interviewer questions
- **Optimization Discussion**: How to improve solutions

### 🔄 **7. Alternative Techniques**
- **Other Possible Approaches**: Brief mention of 3rd+ approaches
- **Advanced Optimizations**: Space/time trade-offs
- **Related Problem Patterns**: What this prepares you for

### 💡 **8. Key Takeaways**
- **Core Concepts**: Main algorithmic insights
- **Transferable Skills**: How this applies to other problems
- **Interview Tips**: Specific advice for this problem type

## Analysis Guidelines:
- **Consolidate Information**: Treat all screenshots as ONE complete problem
- **Two Complete Solutions**: Provide TWO fully implemented approaches
- **Interview-Focused**: Format for real interview scenarios  
- **Comprehensive Coverage**: Include everything from ALL screenshots
- **Production Quality**: Clean, documented, testable code
- **Strategic Thinking**: Help understand WHY each approach works

Analyze ALL screenshots comprehensively and provide this complete analysis as ONE cohesive response!"""

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
async def verify_vision_provider_connection(base_url: str, api_key: str, model_name: str) -> bool:
    """Verify a vision provider connection"""
    try:
        temp_client = AsyncOpenAI(base_url=base_url, api_key=api_key)
        await asyncio.wait_for(temp_client.models.list(), timeout=10.0)
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