import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from services.llm_service import verify_groq_api_key, get_ai_answer, process_candidate_response, clear_conversation_history
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
    onboarding_context = {}

    async def on_transcript(data):
        """Callback function to handle transcripts from Deepgram."""
        try:
            # Always send transcript updates to client (both interim and final)
            await send_json(websocket, "transcript_update", data)

            # Only generate AI responses for final results to avoid duplicates
            is_final = data.get('is_final', True)
            
            if is_final:
                # Handle different speakers with conversation tracking
                # Speaker 0 = System audio (INTERVIEWER)  
                # Speaker 1 = Microphone (CANDIDATE)
                if data.get('speaker') == 0 and data.get('transcript'):
                    interviewer_question = data['transcript']
                    print(f"🎤 INTERVIEWER (FINAL): {interviewer_question}")
                    
                    # Generate AI answer (not just suggestion)
                    answer = get_ai_answer(interviewer_question, onboarding_context)
                    await send_json(websocket, "ai_answer", {"answer": answer})
                    print(f"🤖 AI ANSWER: {answer}")
                    
                elif data.get('speaker') == 1 and data.get('transcript'):
                    candidate_response = data['transcript']
                    print(f"👤 CANDIDATE (FINAL): {candidate_response}")
                    
                    # Process candidate response for conversation context
                    process_candidate_response(candidate_response)
            else:
                # For interim results, just log without generating AI responses
                speaker_type = "INTERVIEWER" if data.get('speaker') == 0 else "CANDIDATE"
                print(f"⏳ {speaker_type} (interim): {data.get('transcript', '')}")
                
        except WebSocketDisconnect:
            print("🔌 Client disconnected while sending transcript/answer")
        except Exception as e:
            print(f"❌ ERROR: Error in transcript callback: {e}")

    try:
        # 1. Immediately check the keys upon connection
        print("🔑 Verifying API keys...")
        is_deepgram_valid = verify_deepgram_api_key()
        is_groq_valid = verify_groq_api_key()
        await send_json(websocket, "api_key_status", {"service": "deepgram", "valid": is_deepgram_valid})
        await send_json(websocket, "api_key_status", {"service": "groq", "valid": is_groq_valid})

        # 2. Listen for messages from the client
        while True:
            message = await websocket.receive()
            if 'text' in message:
                data = json.loads(message['text'])
                if data['type'] == 'start_interview':
                    print("🎬 Starting interview session...")
                    onboarding_context = data.get('payload', {})
                    
                    # Clear any previous conversation history
                    clear_conversation_history()
                    print("🧹 Conversation history cleared for new interview")
                    
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