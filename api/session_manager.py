import uuid
import asyncio
import time
from typing import Dict, Optional
from fastapi import WebSocket

from .utils import send_json
from services.llm_service import MultiLLMManager
from services.stt_service import DeepgramManager
from services.vision_service import vision_service

# Session TTL: 30 minutes of inactivity with no WebSocket connected
SESSION_TTL_SECONDS = 30 * 60

class InterviewSession:
    """
    Represents a single, stateful interview session.
    This object persists even if the WebSocket connection is lost.
    """
    def __init__(self, session_id: str):
        self.session_id: str = session_id
        self.websockets: list[WebSocket] = []
        self.llm_manager: Optional[MultiLLMManager] = None
        self.stt_manager: Optional[DeepgramManager] = None
        self.is_active: bool = False
        self.state: Dict[str, any] = {
            "is_muted": True,  # Default microphone is muted on start
            "process_all_speakers": True,
            "is_universally_muted": False,
            "screenshot_queue_count": 0,
            "vision_mode_active": False
        }
        self.transcript_buffer: str = ""
        self.silence_timer: Optional[asyncio.Task] = None
        self.last_activity_time: float = time.time()
        self.last_request_type: Optional[str] = None
        self.last_request_payload: Optional[dict] = None
        self._chunk_log_counter = 0

    def _touch(self):
        """Update last activity time."""
        self.last_activity_time = time.time()

    def add_websocket(self, websocket: WebSocket):
        """Register a new websocket connection to this session."""
        if websocket not in self.websockets:
            self.websockets.append(websocket)
            print(f"🔌 WebSocket added to session {self.session_id}. Total: {len(self.websockets)}")

    def remove_websocket(self, websocket: WebSocket):
        """Unregister a websocket connection from this session."""
        if websocket in self.websockets:
            self.websockets.remove(websocket)
            print(f"🔌 WebSocket removed from session {self.session_id}. Remaining: {len(self.websockets)}")

    async def _send_json(self, type: str, payload: dict):
        """Safely sends a JSON message to all connected websockets."""
        if self.websockets:
            self._touch()
            tasks = [send_json(ws, type, payload) for ws in self.websockets]
            await asyncio.gather(*tasks, return_exceptions=True)

    async def handle_verify_deepgram(self, payload: dict):
        """Handles the deepgram verification request from the client."""
        from services.stt_service import verify_deepgram_api_key
        self._touch()
        print(f"➡️ [BACKEND] Received 'verify_deepgram' for session {self.session_id}")
        is_valid = await verify_deepgram_api_key()
        print(f"⬅️ [BACKEND] Sending 'api_key_status' for Deepgram. Valid: {is_valid}")
        await self._send_json("api_key_status", {"service": "deepgram", "valid": is_valid})

    async def handle_start_interview(self, payload: dict):
        """Handles the 'start_interview' message."""
        self._touch()
        print(f"🎬 Session {self.session_id}: Starting interview...")
        try:
            primary_provider_config = payload.get('aiProvider')
            secondary_provider_config = payload.get('aiSecondaryProvider')
            primary_vision_config = payload.get('visionProvider')
            secondary_vision_config = payload.get('visionSecondaryProvider')
            onboarding_context = payload.get('onboardingData', {})
            
            self.state["is_muted"] = payload.get('is_muted', False)
            self.state["process_all_speakers"] = payload.get('process_all_speakers', True)
            self.state["is_universally_muted"] = payload.get('is_universally_muted', False)

            await self.initialize_managers(primary_provider_config, secondary_provider_config, primary_vision_config, secondary_vision_config, onboarding_context)
            
            current_preset = self.llm_manager.get_current_preset_info()
            health_results = await self.llm_manager.perform_health_checks()
            await self._send_json("preset_initialized", {
                "current_preset": current_preset,
                "available_presets": list(self.llm_manager.presets.keys()),
                "health_status": health_results
            })
            print(f"✅ Session {self.session_id}: Interview started and managers initialized.")
        except Exception as e:
            print(f"❌ CRITICAL: Session {self.session_id}: Failed to start interview: {e}")
            await self._send_json("error", {"message": f"Failed to initialize AI providers: {str(e)}"})

    async def handle_audio_chunk(self, payload: dict):
        """Handles incoming audio chunks."""
        self._touch()
        if self.stt_manager and not self.state.get("is_universally_muted", False):
            audio_data = bytes(payload.get('audio', []))
            self.state["is_muted"] = payload.get('is_muted', False)
            
            # Throttle logging to avoid console spam (every 50 chunks = approx. every 1.5s)
            self._chunk_log_counter += 1
            if self._chunk_log_counter % 50 == 0:
                print(f"📥 [AUDIO FLOW] Chunk #{self._chunk_log_counter} received: {len(audio_data)} bytes. Mic Muted: {self.state['is_muted']}. Deepgram connected: {self.stt_manager.is_connected}")
                
            if audio_data:
                await self.stt_manager.send_audio(audio_data)

    async def handle_config_update(self, payload: dict):
        """Handles configuration updates from the client."""
        self._touch()
        if 'processAllSpeakers' in payload:
            self.state["process_all_speakers"] = payload['processAllSpeakers']
        if 'isUniversallyMuted' in payload:
            self.state["is_universally_muted"] = payload['isUniversallyMuted']
        if 'isMuted' in payload:
            self.state["is_muted"] = payload['isMuted']
        await self._send_json("config_updated", self.state)
        await self._send_json("state_updated", self.state)

    async def handle_phone_toggle_vision_mode(self, payload: dict):
        self._touch()
        print(f"📱 Phone remote request: toggle_vision_mode")
        await self._send_json("toggle_vision_mode", {})

    async def handle_phone_capture_screenshot(self, payload: dict):
        self._touch()
        print(f"📱 Phone remote request: capture_screenshot")
        await self._send_json("capture_screenshot", {})

    async def handle_phone_process_screenshots(self, payload: dict):
        self._touch()
        print(f"📱 Phone remote request: process_screenshots")
        await self._send_json("process_screenshots", {})

    async def handle_phone_reset_screenshot_queue(self, payload: dict):
        self._touch()
        print(f"📱 Phone remote request: reset_screenshot_queue")
        await self._send_json("reset_screenshot_queue", {})

    async def handle_phone_toggle_mic_mute(self, payload: dict):
        self._touch()
        print(f"📱 Phone remote request: toggle_mic_mute")
        await self._send_json("toggle_mic_mute", {})

    async def handle_phone_toggle_universal_mute(self, payload: dict):
        self._touch()
        print(f"📱 Phone remote request: toggle_universal_mute")
        await self._send_json("toggle_universal_mute", {})

    async def handle_screenshot_queue_update(self, payload: dict):
        self._touch()
        count = payload.get('count', 0)
        self.state["screenshot_queue_count"] = count
        await self._send_json("state_updated", self.state)

    async def handle_vision_mode_update(self, payload: dict):
        self._touch()
        is_active = payload.get('isActive', False)
        self.state["vision_mode_active"] = is_active
        await self._send_json("state_updated", self.state)

    async def handle_switch_preset(self, payload: dict):
        """Handles preset switching."""
        self._touch()
        if not self.llm_manager:
            return await self._send_json("error", {"message": "AI providers not initialized"})
        
        preset_key = payload.get('preset_key')
        success, result = await self.llm_manager.switch_preset(preset_key)
        
        if success:
            await self._send_json("preset_switched", {"success": True, **result})
        else:
            await self._send_json("preset_switch_failed", {"success": False, **result})

    async def handle_vision_analysis(self, payload: dict):
        """Handles vision analysis requests."""
        self._touch()
        self.last_request_type = "vision"
        self.last_request_payload = payload
        try:
            print(f"🔍 Session {self.session_id}: Processing vision analysis request...")
            
            prompt = payload.get('prompt', '')
            screenshots = payload.get('screenshots', [])
            vision_config = payload.get('visionConfig', {})
            languages = payload.get('languages', [])
            
            if not screenshots:
                await self._send_json("vision_analysis_result", {
                    "success": False,
                    "error": "No screenshots provided for analysis"
                })
                return
            
            if not vision_config or not vision_config.get('provider') or not vision_config.get('model'):
                await self._send_json("vision_analysis_result", {
                    "success": False,
                    "error": "Vision provider configuration missing"
                })
                return
            
            provider_name = vision_config['provider']
            model_name = vision_config['model']
            
            # --- Two-step pipeline: OCR/Extraction -> Text LLM ---
            # Step 1: Use Vision AI to extract text/questions from screenshots
            print(f"👁️ Step 1: Extracting text/code from {len(screenshots)} screenshots using {provider_name}-{model_name}")
            
            extraction_prompt = "Извлеки весь текст, вопросы теста, варианты ответов и код со скриншотов. Верни только распознанный текст без твоих ответов и без комментариев."
            
            ocr_text, ocr_result_info = await vision_service.analyze_coding_problem_ocr(
                provider_name=provider_name,
                model_name=model_name,
                screenshots=screenshots,
                prompt=extraction_prompt
            )
            
            # Check if OCR step succeeded (default False so errors are always caught)
            ocr_succeeded = ocr_result_info.get("success", False)
            
            if not ocr_succeeded:
                # Vision OCR failed (e.g. no network / connection error)
                error_detail = ocr_result_info.get("error", "unknown")
                print(f"⚠️ OCR step failed ({error_detail}). Attempting LLM-only fallback...")
                
                if self.llm_manager:
                    # Fallback: ask LLM to answer based on prompt alone (no screenshots)
                    current_preset = self.llm_manager.get_current_preset_info()
                    text_provider = current_preset.get("provider", "Unknown")
                    text_model = current_preset.get("model", "Unknown")
                    
                    fallback_prompt = (
                        f"Система распознавания изображений временно недоступна (ошибка сети). "
                        f"Пожалуйста, ответь на вопрос или задачу на основе контекста из промпта:\n\n{prompt}"
                    )
                    answer, solve_result_info = await self.llm_manager.get_ai_answer(fallback_prompt, stream_callback=None)
                    
                    if solve_result_info.get("success"):
                        await self._send_json("vision_analysis_result", {
                            "success": True,
                            "analysis": f"⚠️ *Распознавание скриншота недоступно (Vision API недоступен). Ответ на основе промпта:*\n\n{answer}",
                            "provider": text_provider,
                            "model": text_model,
                            "screenshot_count": len(screenshots),
                            "languages": languages,
                            "ocr_skipped": True,
                        })
                    else:
                        await self._send_json("vision_analysis_result", {
                            "success": False,
                            "error": f"Сеть недоступна: Vision API и LLM API недоступны. Проверьте VPN/сеть."
                        })
                else:
                    await self._send_json("vision_analysis_result", {
                        "success": False,
                        "error": "Сеть недоступна: Vision API недоступен. Проверьте VPN/сеть."
                    })
                print(f"✅ Session {self.session_id}: Vision analysis (fallback) completed")
                return
                
            # Step 2: Use the active text model (e.g. qwen-3-235b-thinking) to solve the extracted problem
            if self.llm_manager:
                current_preset = self.llm_manager.get_current_preset_info()
                text_provider = current_preset.get("provider", "Unknown")
                text_model = current_preset.get("model", "Unknown")
                print(f"🧠 Step 2: Solving extracted question using text model {text_provider}-{text_model}")
                
                # Search for relevant materials from local cheat sheet (RAG)
                rag_context = ""
                if self.llm_manager.shared_context:
                    rag_context = self.llm_manager.shared_context.get_relevant_materials(ocr_text)
                
                # Build prompt for solving
                solve_prompt = f"Ниже приведён текст, извлечённый из скриншота теста/задачи. Реши этот тест или задачу.\n\n[Текст со скриншота]:\n{ocr_text}"
                if rag_context:
                    solve_prompt += f"\n\n[СПРАВОЧНЫЕ МАТЕРИАЛЫ ИЗ ШПАРГАЛКИ (используй для решения, если применимо)]:\n{rag_context}"
                
                answer, solve_result_info = await self.llm_manager.get_ai_answer(solve_prompt, stream_callback=None)
                
                await self._send_json("vision_analysis_result", {
                    "success": True,
                    "analysis": answer,
                    "provider": text_provider,
                    "model": text_model,
                    "screenshot_count": len(screenshots),
                    "languages": languages,
                    **solve_result_info
                })
            else:
                # Fallback to single-step if text manager is not initialized
                print("⚠️ Fallback to single-step vision analysis as LLM Manager is missing")
                analysis, result_info = await vision_service.analyze_coding_problem(
                    provider_name=provider_name,
                    model_name=model_name,
                    screenshots=screenshots,
                    languages=languages
                )
                await self._send_json("vision_analysis_result", {
                    "success": result_info.get("success", True),
                    "analysis": analysis,
                    "provider": provider_name,
                    "model": model_name,
                    "screenshot_count": len(screenshots),
                    "languages": languages,
                    **result_info
                })
            
            print(f"✅ Session {self.session_id}: Vision analysis completed successfully")
            
        except Exception as e:
            print(f"❌ CRITICAL: Session {self.session_id}: Vision analysis failed: {e}")
            await self._send_json("vision_analysis_result", {
                "success": False,
                "error": f"Vision analysis failed: {str(e)}"
            })

    async def handle_end_interview(self, payload: dict):
        """Handles the end of an interview."""
        print(f"🛑 Session {self.session_id}: Ending interview.")
        await self._send_json("interview_ended", {})
        await self.cleanup()
        session_manager.remove_session(self.session_id)

    async def handle_reset_session(self, payload: dict):
        """Handles the reset of a session's context."""
        self._touch()
        print(f"🔄 Session {self.session_id}: Resetting interview context...")
        self.transcript_buffer = ""
        if self.silence_timer:
            self.silence_timer.cancel()
        
        if self.llm_manager:
            self.llm_manager.reset_context()

        await self._send_json("session_reset_complete", {"status": "ok"})
        print(f"✅ Session {self.session_id}: Context has been reset.")

    async def handle_regenerate_response(self, payload: dict):
        """Handles response regeneration requests."""
        self._touch()
        if not self.last_request_type or not self.last_request_payload:
            print("⚠️ No previous request to regenerate")
            await self._send_json("error", {"message": "Нет предыдущего ответа для регенерации."})
            return
            
        print(f"🔄 Session {self.session_id}: Regenerating last response ({self.last_request_type})...")
        
        # Remove the last exchange from conversation history since we are regenerating it
        if self.llm_manager and self.llm_manager.shared_context:
            history = self.llm_manager.shared_context.conversation_history
            if history:
                history.pop()
                print("🧹 Removed last exchange from conversation history for regeneration")
        
        if self.last_request_type == "vision":
            # For vision, re-run vision analysis with the exact same payload
            await self.handle_vision_analysis(self.last_request_payload)
        elif self.last_request_type == "text":
            # For text, re-run with the exact same question
            question = self.last_request_payload.get("question")
            if question:
                try:
                    await self._send_json("ai_processing_started", {"question": question})
                    async def stream_callback(chunk: str, chunk_type: str):
                        return await self._send_json("ai_answer_chunk", {"chunk": chunk, "chunk_type": chunk_type})
                    answer, result_info = await self.llm_manager.get_ai_answer(question, stream_callback)
                    await self._send_json("ai_answer_complete", {"answer": answer, **result_info})
                    print(f"🤖 AI STREAMING COMPLETE (REGENERATED) for session {self.session_id}")
                except Exception as e:
                    print(f"❌ CRITICAL: Error regenerating transcript: {e}")
                    await self._send_json("error", {"message": "Ошибка регенерации ответа."})

    async def initialize_managers(self, primary_provider_config, secondary_provider_config, primary_vision_config, secondary_vision_config, onboarding_context):
        """Initializes all necessary managers for the session."""
        self.llm_manager = MultiLLMManager()
        config_loaded = self.llm_manager.load_configuration(
            primary_config=primary_provider_config,
            secondary_config=secondary_provider_config
        )
        if not config_loaded:
            raise ValueError("Failed to load AI provider configuration.")
        
        self.llm_manager.initialize_candidate_context(onboarding_context)
        vision_service.set_context_manager(self.llm_manager.shared_context)
        await self.llm_manager.perform_health_checks()

        vision_service.load_vision_providers(
            primary_config=primary_vision_config,
            secondary_config=secondary_vision_config
        )

        user_languages = onboarding_context.get('selectedLanguages', [])
        self.stt_manager = DeepgramManager(self.on_transcript, user_languages)
        await self.stt_manager.start()
        
        self.is_active = True

    async def _process_aggregated_transcript(self):
        """Processes the buffered transcript after a period of silence."""
        if not self.transcript_buffer:
            return

        transcript = self.transcript_buffer
        self.transcript_buffer = ""
        
        print(f"✅ Silence detected. Processing transcript for session {self.session_id}: {transcript}")
        if not self.llm_manager or not self.websockets:
            return

        try:
            self.last_request_type = "text"
            self.last_request_payload = {"question": transcript}
            await self._send_json("ai_processing_started", {"question": transcript})

            async def stream_callback(chunk: str, chunk_type: str):
                return await self._send_json("ai_answer_chunk", {"chunk": chunk, "chunk_type": chunk_type})

            answer, result_info = await self.llm_manager.get_ai_answer(transcript, stream_callback)
            
            await self._send_json("ai_answer_complete", {"answer": answer, **result_info})
            print(f"🤖 AI STREAMING COMPLETE for session {self.session_id}")

        except Exception as e:
            print(f"❌ CRITICAL: Error processing transcript for session {self.session_id}: {e}")
            await self._send_json("error", {"message": "Error processing transcript."})

    async def on_transcript(self, data):
        """Callback from Deepgram. Handles transcript logic and silence detection."""
        if self.state.get("is_universally_muted"):
            return

        self._touch()
        await self._send_json("transcript_update", data)

        transcript = data.get('transcript', '').strip()
        is_final = data.get('is_final', False)

        if transcript:
            if self.silence_timer:
                self.silence_timer.cancel()
            
            async def delayed_processing():
                await asyncio.sleep(1.5)
                await self._process_aggregated_transcript()
            
            self.silence_timer = asyncio.create_task(delayed_processing())

        speaker = data.get('speaker')
        should_process = self.state.get("is_muted") or self.state.get("process_all_speakers") or (speaker == 0)

        if is_final and should_process:
            self.transcript_buffer = (self.transcript_buffer + " " + transcript).strip()
        elif is_final and not should_process:
            if self.llm_manager:
                self.llm_manager.process_candidate_response(transcript)

    async def cleanup(self):
        """Cleans up resources for the session."""
        if self.stt_manager:
            await self.stt_manager.finish()
        if self.silence_timer and not self.silence_timer.done():
            self.silence_timer.cancel()
        self.is_active = False
        print(f"Session {self.session_id} cleaned up.")


class SessionManager:
    """
    Manages all active interview sessions.
    Includes TTL-based cleanup for stale sessions.
    """
    def __init__(self):
        self.active_sessions: Dict[str, InterviewSession] = {}
        self._cleanup_task: Optional[asyncio.Task] = None

    def create_session(self) -> InterviewSession:
        """Creates a new, unique interview session."""
        session_id = str(uuid.uuid4())
        session = InterviewSession(session_id)
        self.active_sessions[session_id] = session
        print(f"Created new session: {session_id} (total active: {len(self.active_sessions)})")
        return session

    def get_session(self, session_id: str) -> Optional[InterviewSession]:
        """Retrieves an existing session by its ID."""
        session = self.active_sessions.get(session_id)
        if session:
            session._touch()
        return session

    def remove_session(self, session_id: str):
        """Removes a session and cleans up its resources."""
        if session_id in self.active_sessions:
            del self.active_sessions[session_id]
            print(f"Removed session: {session_id} (remaining: {len(self.active_sessions)})")

    def start_cleanup_task(self):
        """Start the background cleanup task for stale sessions."""
        if self._cleanup_task is None or self._cleanup_task.done():
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())
            print("🧹 Session cleanup task started (checks every 5 minutes)")

    async def _cleanup_loop(self):
        """Periodically clean up stale sessions."""
        while True:
            await asyncio.sleep(300)  # Check every 5 minutes
            await self._cleanup_stale_sessions()

    async def _cleanup_stale_sessions(self):
        """Remove sessions that have been inactive and disconnected for too long."""
        now = time.time()
        stale_ids = []
        
        for sid, session in self.active_sessions.items():
            if not session.websockets:
                idle_time = now - session.last_activity_time
                if idle_time > SESSION_TTL_SECONDS:
                    stale_ids.append(sid)
        
        for sid in stale_ids:
            session = self.active_sessions.get(sid)
            if session:
                try:
                    await session.cleanup()
                except Exception as e:
                    print(f"⚠️ Error cleaning up stale session {sid}: {e}")
                del self.active_sessions[sid]
                print(f"🧹 Cleaned up stale session: {sid} (remaining: {len(self.active_sessions)})")
        
        if stale_ids:
            print(f"🧹 Cleaned up {len(stale_ids)} stale session(s)")

# Create a single, global instance of the SessionManager
session_manager = SessionManager()
