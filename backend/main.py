import os
import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

# Import local ML evaluator
from .ml_analyzer import evaluate_report_ml

app = FastAPI(title="VeriReport Python AI/ML Backend")

# Enable CORS for frontend communication during dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SYSTEM_PROMPT = """You are an expert academic examiner and document authenticator.
Your job is to grade the uploaded student report out of 100 marks, checking both the textual data and the attached images.

CRITICAL RULES FOR GRADING:
1. AI-generated images check:
   If any image in the report is AI-generated (look for typical synthetic rendering signs: plastic skin textures, gibberish or deformed text inside diagrams, impossible geometric lines, perfect airbrushed highlights, typical style of Midjourney/DALL-E, or weird limb structures in people), you MUST set "isAI": true, "status": "flagged_ai", and the final "score": 0.
2. Household / family images check:
   If any image is a household photo (look for faces in casual environments, selfies, family gatherings, home settings like kitchens, bedrooms, living rooms, gardens, domestic pets like dogs/cats, or personal/non-academic content) instead of authentic project/field experiment data, you MUST set "isHousehold": true, "status": "flagged_household", and the final "score": 0.
3. AI-generated text check:
   The use of AI-generated text in the report is FULLY ALLOWED and should NOT be penalized. If the student uses AI text, you should grade it purely on its data precision, structure, academic quality, and clarity. If it has good content and is clear, award a nice/high score.
4. Correct report data and images check:
   If there are NO AI-generated images and NO household/family images, grade the report on a scale of 1 to 100 based on text quality, data precision, academic worth, and image relevance.
   A score of 60 or above is a PASS. A score below 60 is a FAIL.
   GRACE BAND RULE: If you would award a score between 55 and 59 (inclusive), you MUST round it up to 60 so the student achieves a PASS. Scores of 54 and below remain unchanged (FAIL).

Your response MUST be a single, valid JSON object following this exact schema:
{
  "score": number, // out of 100. MUST be 0 if any image is AI or household.
  "summary": "Detailed overall summary explaining the grading and feedback...",
  "dataAssessment": "Detailed verification of the data accuracy...",
  "remarks": "Overall examiner remarks, academic recommendations, or actionable next steps for the student...",
  "images": [
    {
      "index": number, // index of the image matching the [IMAGE INDEX X] labels
      "isAI": boolean,
      "isHousehold": boolean,
      "assessment": "Explanation of what is in the image and why it is flagged or valid...",
      "status": "valid" | "flagged_ai" | "flagged_household"
    }
  ]
}

Ensure there are no markdown boxes (like ```json) surrounding the response, just return the raw JSON string."""

class EvaluationRequest(BaseModel):
    filename: str
    text: str
    images: List[str]  # List of base64 data URLs
    apiKey: Optional[str] = None  # Backward compatibility
    geminiApiKey: Optional[str] = None
    openaiApiKey: Optional[str] = None
    anthropicApiKey: Optional[str] = None
    blackboxApiKey: Optional[str] = None
    engine: Optional[str] = "gemini"  # gemini, chatgpt, claude, blackbox, compare
    simulationScenario: Optional[str] = "valid"

def base64_to_gemini_part(base64_url: str):
    """
    Converts a base64 image data URL string into a Gemini REST API inlineData part.
    """
    import re
    match = re.match(r"^data:(image/[a-zA-Z+.-]+);base64,(.+)$", base64_url)
    if match:
        return {
            "inlineData": {
                "mimeType": match.group(1),
                "data": match.group(2)
            }
        }
    return None

def evaluate_with_gemini_api(text: str, images: List[str], api_key: str) -> dict:
    """
    Calls the Gemini API from Python using standard REST requests.
    """
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key={api_key}"
    
    parts = [{"text": f"{SYSTEM_PROMPT}\n\nDOCUMENT TEXT CONTENT:\n{text}\n\nBelow are the images extracted from the report. Each image is preceded by an index label. Please examine each image carefully and align your JSON indexes with these labels."}]
    
    for idx, img_url in enumerate(images):
        parts.append({"text": f"\n\n[IMAGE INDEX {idx}]"})
        part = base64_to_gemini_part(img_url)
        if part:
            parts.append(part)
            
    headers = {"Content-Type": "application/json"}
    body = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.1
        }
    }
    
    response = requests.post(url, headers=headers, json=body, timeout=30)
    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code, 
            detail=f"Gemini API returned error: {response.text}"
        )
        
    res_data = response.json()
    try:
        raw_text = res_data["candidates"][0]["content"]["parts"][0]["text"].strip()
        # Clean potential markdown wrapping
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]
        
        import json
        return json.loads(raw_text.strip())
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse Gemini response: {str(e)}. Raw: {response.text}"
        )

def evaluate_with_openai_api(text: str, images: List[str], api_key: str) -> dict:
    """
    Calls OpenAI Chat Completions API with vision.
    """
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    user_content = [
        {
            "type": "text",
            "text": f"DOCUMENT TEXT CONTENT:\n{text}\n\nBelow are the images extracted from the report. Each image is preceded by an index label. Please examine each image carefully and align your JSON indexes with these labels."
        }
    ]
    
    for idx, img_url in enumerate(images):
        user_content.append({"type": "text", "text": f"\n\n[IMAGE INDEX {idx}]"})
        user_content.append({
            "type": "image_url",
            "image_url": {
                "url": img_url
            }
        })
        
    body = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1
    }
    
    response = requests.post(url, headers=headers, json=body, timeout=30)
    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code, 
            detail=f"OpenAI API returned error: {response.text}"
        )
        
    res_data = response.json()
    try:
        raw_text = res_data["choices"][0]["message"]["content"].strip()
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]
        
        import json
        return json.loads(raw_text.strip())
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse OpenAI response: {str(e)}. Raw: {response.text}"
        )

def evaluate_with_claude_api(text: str, images: List[str], api_key: str) -> dict:
    """
    Calls Anthropic Claude API with vision.
    """
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    }
    
    import re
    content_parts = [
        {
            "type": "text",
            "text": f"DOCUMENT TEXT CONTENT:\n{text}\n\nBelow are the images extracted from the report. Each image is preceded by an index label. Please examine each image carefully and align your JSON indexes with these labels."
        }
    ]
    
    for idx, img_url in enumerate(images):
        content_parts.append({"type": "text", "text": f"\n\n[IMAGE INDEX {idx}]"})
        match = re.match(r"^data:(image/[a-zA-Z+.-]+);base64,(.+)$", img_url)
        if match:
            mime_type = match.group(1)
            base64_data = match.group(2)
            content_parts.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": mime_type,
                    "data": base64_data
                }
            })
            
    body = {
        "model": "claude-3-5-sonnet-20241022",
        "max_tokens": 4000,
        "system": SYSTEM_PROMPT,
        "messages": [
            {"role": "user", "content": content_parts}
        ],
        "temperature": 0.1
    }
    
    response = requests.post(url, headers=headers, json=body, timeout=45)
    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code, 
            detail=f"Anthropic API returned error: {response.text}"
        )
        
    res_data = response.json()
    try:
        raw_text = res_data["content"][0]["text"].strip()
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]
        
        import json
        return json.loads(raw_text.strip())
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse Anthropic response: {str(e)}. Raw: {response.text}"
        )

def evaluate_with_blackbox_api(text: str, images: List[str], api_key: str) -> dict:
    """
    Calls Blackbox AI vision endpoint (OpenAI compatible).
    """
    url = "https://api.blackbox.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    user_content = [
        {
            "type": "text",
            "text": f"DOCUMENT TEXT CONTENT:\n{text}\n\nBelow are the images extracted from the report. Each image is preceded by an index label. Please examine each image carefully and align your JSON indexes with these labels."
        }
    ]
    
    for idx, img_url in enumerate(images):
        user_content.append({"type": "text", "text": f"\n\n[IMAGE INDEX {idx}]"})
        user_content.append({
            "type": "image_url",
            "image_url": {
                "url": img_url
            }
        })
        
    body = {
        "model": "blackboxai",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content}
        ],
        "temperature": 0.1
    }
    
    response = requests.post(url, headers=headers, json=body, timeout=30)
    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code, 
            detail=f"Blackbox API returned error: {response.text}"
        )
        
    res_data = response.json()
    try:
        raw_text = res_data["choices"][0]["message"]["content"].strip()
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]
        
        import json
        return json.loads(raw_text.strip())
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse Blackbox response: {str(e)}. Raw: {response.text}"
        )

def run_single_engine(engine: str, req: EvaluationRequest) -> dict:
    """
    Evaluates the report with a single specified engine (calling API or falling back to simulation).
    """
    engine = engine.lower()
    if engine == "gemini":
        gemini_key = req.geminiApiKey or req.apiKey
        if gemini_key and gemini_key.strip():
            try:
                return evaluate_with_gemini_api(req.text, req.images, gemini_key)
            except Exception as e:
                local_res = evaluate_report_ml(req.filename, req.text, req.images, req.simulationScenario, engine)
                local_res["summary"] = f"(Gemini API Error - Local Simulation Fallback) {local_res['summary']} [Error details: {str(e)}]"
                return local_res
        else:
            return evaluate_report_ml(req.filename, req.text, req.images, req.simulationScenario, engine)
            
    elif engine == "chatgpt":
        if req.openaiApiKey and req.openaiApiKey.strip():
            try:
                return evaluate_with_openai_api(req.text, req.images, req.openaiApiKey)
            except Exception as e:
                local_res = evaluate_report_ml(req.filename, req.text, req.images, req.simulationScenario, engine)
                local_res["summary"] = f"(ChatGPT API Error - Local Simulation Fallback) {local_res['summary']} [Error details: {str(e)}]"
                return local_res
        else:
            return evaluate_report_ml(req.filename, req.text, req.images, req.simulationScenario, engine)
            
    elif engine == "claude":
        if req.anthropicApiKey and req.anthropicApiKey.strip():
            try:
                return evaluate_with_claude_api(req.text, req.images, req.anthropicApiKey)
            except Exception as e:
                local_res = evaluate_report_ml(req.filename, req.text, req.images, req.simulationScenario, engine)
                local_res["summary"] = f"(Claude API Error - Local Simulation Fallback) {local_res['summary']} [Error details: {str(e)}]"
                return local_res
        else:
            return evaluate_report_ml(req.filename, req.text, req.images, req.simulationScenario, engine)
            
    elif engine == "blackbox":
        if req.blackboxApiKey and req.blackboxApiKey.strip():
            try:
                return evaluate_with_blackbox_api(req.text, req.images, req.blackboxApiKey)
            except Exception as e:
                local_res = evaluate_report_ml(req.filename, req.text, req.images, req.simulationScenario, engine)
                local_res["summary"] = f"(Blackbox API Error - Local Simulation Fallback) {local_res['summary']} [Error details: {str(e)}]"
                return local_res
        else:
            return evaluate_report_ml(req.filename, req.text, req.images, req.simulationScenario, engine)
            
    return evaluate_report_ml(req.filename, req.text, req.images, req.simulationScenario, "gemini")

@app.post("/api/grade")
async def grade_report(req: EvaluationRequest):
    engine = (req.engine or "gemini").lower()
    
    if engine == "compare":
        # Run all four models in parallel using ThreadPoolExecutor
        from concurrent.futures import ThreadPoolExecutor
        engines = ["gemini", "chatgpt", "claude", "blackbox"]
        comparison_results = {}
        
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = {executor.submit(run_single_engine, eng, req): eng for eng in engines}
            for future in futures:
                eng = futures[future]
                try:
                    comparison_results[eng] = future.result()
                except Exception as e:
                    comparison_results[eng] = evaluate_report_ml(req.filename, req.text, req.images, req.simulationScenario, eng)
                    comparison_results[eng]["summary"] = f"(Comparison Thread Error) {comparison_results[eng]['summary']} [Error: {str(e)}]"
        
        return {
            "engine": "compare",
            "comparison": comparison_results
        }
    else:
        res = run_single_engine(engine, req)
        res["engine"] = engine
        return res

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "provider": "python-local-ml"}

