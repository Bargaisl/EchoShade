import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from services.llm_service import LLMManager
from services.stt_service import verify_deepgram_api_key, DeepgramManager

router = APIRouter()

async def send_json(websocket: WebSocket, type: str, payload: dict):
    """Helper function to send JSON data to the client."""
    await websocket.send_text(json.dumps({"type": type, "payload": payload}))

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("🔗 WebSocket connection established")
    
    dg_manager = None
    llm_manager = None
    
    # --- Transcript Buffering ---
    transcript_buffer = ""
    buffer_timer = None

    async def process_buffered_transcript():
        nonlocal transcript_buffer
        if transcript_buffer:
            print(f"✅ Processing buffered transcript: {transcript_buffer}")
            if llm_manager:
                answer = await llm_manager.get_ai_answer(transcript_buffer, onboarding_context)
                await send_json(websocket, "ai_answer", {"answer": answer})
                print(f"🤖 AI ANSWER: {answer}")
            else:
                print("⚠️ LLM Manager not initialized, cannot get AI answer.")
            transcript_buffer = "" # Clear buffer after processing

    async def on_transcript(data):
        """Callback function to handle transcripts from Deepgram."""
        nonlocal transcript_buffer, buffer_timer
        try:
            await send_json(websocket, "transcript_update", data)

            is_final = data.get('is_final', False)
            transcript = data.get('transcript', '')
            speaker = data.get('speaker')

            # --- Interviewer (Speaker 0) Logic ---
            if transcript and speaker == 0:
                transcript_buffer += transcript + " "
                
                if buffer_timer and not buffer_timer.done():
                    buffer_timer.cancel()
                
                if is_final:
                    # Use a new, clean task for the timer
                    async def delayed_processing():
                        await asyncio.sleep(1.2)
                        await process_buffered_transcript()
                    
                    buffer_timer = asyncio.create_task(delayed_processing())

            # --- Candidate (Speaker 1) Logic ---
            elif is_final and speaker == 1 and transcript:
                candidate_response = transcript
                print(f"👤 CANDIDATE (FINAL): {candidate_response}")
                if llm_manager:
                    llm_manager.process_candidate_response(candidate_response)
                
        except WebSocketDisconnect:
            print("🔌 Client disconnected while sending transcript/answer")
        except Exception as e:
            print(f"❌ ERROR: Error in transcript callback: {e}")

    try:
        # 1. Immediately check the Deepgram key upon connection
        print("🔑 Verifying Deepgram API key...")
        is_deepgram_valid = verify_deepgram_api_key()
        await send_json(websocket, "api_key_status", {"service": "deepgram", "valid": is_deepgram_valid})
        # AI provider verification is now done on the frontend before starting

        # 2. Listen for messages from the client
        while True:
            message = await websocket.receive()
            if 'text' in message:
                data = json.loads(message['text'])
                if data['type'] == 'start_interview':
                    print("🎬 Starting interview session...")
                    payload = data.get('payload', {})
                    provider_config = payload.get('aiProvider')
                    onboarding_context = payload.get('onboardingData', {})

                    if not provider_config:
                        print("❌ Cannot start interview: AI provider not selected.")
                        await send_json(websocket, "error", {"message": "AI provider not selected."})
                        return

                    # Load provider details from JSON config
                    with open("ai_providers.json", "r") as f:
                        providers = json.load(f)
                    
                    selected_provider = next((p for p in providers if p["name"] == provider_config.get("name")), None)

                    if not selected_provider:
                        print(f"❌ Provider '{provider_config.get('name')}' not found in config.")
                        return
                        
                    # Create a new LLMManager for this session
                    llm_manager = LLMManager(
                        provider_name=selected_provider.get("name"),
                        base_url=selected_provider.get("baseURL"),
                        api_key=selected_provider.get("apiKey"),
                        model_name=provider_config.get("model")
                    )
                    
                    # Log the context we received for debugging
                    print(f"📋 Interview context loaded:")
                    print(f"   - Name: {onboarding_context.get('name', 'Not provided')}")
                    print(f"   - Company: {onboarding_context.get('company', 'Not provided')}")
                    print(f"   - Role: {onboarding_context.get('role', 'Not provided')}")
                    print(f"   - Focus areas: {onboarding_context.get('focus', [])}")
                    
                    dg_manager = DeepgramManager(on_transcript)
                    await dg_manager.start()
                elif data['type'] == 'end_interview':
                    print("🛑 Ending interview session...")
                    if dg_manager:
                        await dg_manager.finish()
                    break  # End the session
            elif 'bytes' in message:
                if dg_manager:
                    audio_data = message['bytes']
                    if len(audio_data) > 0:
                        # Send raw audio directly to Deepgram for diarization
                        await dg_manager.send_audio(audio_data)
                    else:
                        print("⚠️ WARNING: Received empty audio data")
                else:
                    print("⚠️ WARNING: Received audio but dg_manager is None")

    except WebSocketDisconnect:
        print("🔌 WebSocket connection closed by client")
    except Exception as e:
        print(f"❌ ERROR: WebSocket error: {e}")
    finally:
        if dg_manager:
            await dg_manager.finish()
        print("🧹 WebSocket resources cleaned up")