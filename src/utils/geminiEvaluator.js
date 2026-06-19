/**
 * Evaluates the parsed report text and images using the Gemini API or a simulator.
 */

// Helper to convert base64 image data url into Gemini API inlineData part
function base64ToPart(base64Url) {
  const match = base64Url.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
  if (match) {
    return {
      inlineData: {
        mimeType: match[1],
        data: match[2]
      }
    };
  }
  return null;
}

/**
 * Call the Gemini REST API to evaluate the report content
 * @param {string} text - The extracted document text
 * @param {string[]} images - Array of base64 image data URLs
 * @param {string} apiKey - Gemini API Key
 * @returns {Promise<any>}
 */
async function evaluateWithGemini(text, images, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  // Formulate the strict system prompt
  const systemPrompt = `You are an expert academic examiner and document authenticator.
Your job is to grade the uploaded student report out of 100 marks, checking both the textual data and the attached images.

CRITICAL RULES FOR GRADING:
1. AI-generated images check:
   If any image in the report is AI-generated (look for typical synthetic rendering signs: plastic skin textures, gibberish or deformed text inside diagrams, impossible geometric lines, perfect airbrushed highlights, typical style of Midjourney/DALL-E, or weird limb structures in people), you MUST set "isAI": true, "status": "flagged_ai", and the final "score": 0.
2. Household / family images check:
   If any image is a household photo (look for faces in casual environments, selfies, family gatherings, home settings like kitchens, bedrooms, living rooms, gardens, domestic pets like dogs/cats, or personal/non-academic content) instead of authentic project/field experiment data, you MUST set "isHousehold": true, "status": "flagged_household", and the final "score": 0.
3. Correct report data and images check:
   If there are NO AI-generated images and NO household/family images, and the report data and images are correct, authentic, and relevant to the study (e.g. project charts, field data diagrams, professional graphics, scientific layouts), you should grade the report on a scale of 1 to 100 based on data quality, accuracy, completeness, and image relevance.
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

Ensure there are no markdown boxes (like \`\`\`json) surrounding the response, just return the raw JSON string.`;

  // Create content parts
  const parts = [];
  
  // Add main prompt and text data
  parts.push({
    text: `${systemPrompt}\n\nDOCUMENT TEXT CONTENT:\n${text}\n\nBelow are the images extracted from the report. Each image is preceded by an index label. Please examine each image carefully and align your JSON indexes with these labels.`
  });

  // Add images with explicit index labeling to prevent Gemini index mix-ups
  images.forEach((imgUrl, index) => {
    parts.push({ text: `\n\n[IMAGE INDEX ${index}]` });
    const part = base64ToPart(imgUrl);
    if (part) {
      parts.push(part);
    }
  });

  // Call the endpoint
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: parts
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1 // lower temperature for more deterministic categorization
      }
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Failed to call Gemini API');
  }

  const resultData = await response.json();
  const rawText = resultData.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!rawText) {
    throw new Error('Empty response from Gemini API');
  }

  return JSON.parse(rawText.trim());
}

/**
 * Heuristic scan to auto-detect if the document text or filename implies an AI or Household scenario.
 * This makes simulation mode act automatically and intelligently even if the user didn't toggle the scenario.
 * @param {string} text 
 * @param {string} filename 
 * @returns {string|null} 'ai', 'household', or null
 */
function autoDetectScenario(text, filename) {
  const content = `${filename} ${text}`.toLowerCase();
  
  // Keywords indicating AI images
  const aiKeywords = [
    'ai-generated', 'synthetic image', 'midjourney', 'dall-e', 'stable diffusion', 
    'generated diagram', 'artificial rendering', 'copilot image', 'ai diagram'
  ];
  
  // Keywords indicating Household/Family images
  const householdKeywords = [
    'family', 'selfie', 'household', 'my home', 'my house', 'kitchen', 'bedroom', 
    'living room', 'mother', 'father', 'sister', 'brother', 'family member',
    'my dog', 'my cat', 'pet photo', 'domestic scene'
  ];

  if (aiKeywords.some(keyword => content.includes(keyword))) {
    return 'ai';
  }
  
  if (householdKeywords.some(keyword => content.includes(keyword))) {
    return 'household';
  }

  return null;
}

/**
 * Simulates evaluation for demo purposes.
 * @param {string} filename 
 * @param {string} scenario 
 * @param {number} numImages 
 * @returns {Promise<any>}
 */
async function evaluateSimulation(filename, scenario, numImages) {
  // Wait a short bit to simulate loading
  await new Promise(resolve => setTimeout(resolve, 2000));

  // If there are no images, we shouldn't trigger image violation simulation flags unless specified
  const effectiveScenario = numImages === 0 ? 'valid' : scenario;

  const imagesAssessment = Array.from({ length: numImages }).map((_, idx) => {
    if (effectiveScenario === 'ai' && idx === 0) {
      return {
        index: idx,
        isAI: true,
        isHousehold: false,
        assessment: `Image ${idx + 1} shows artificial textures, unrealistic color blending, and typical distorted text symbols in the diagram, characteristic of AI-generated assets.`,
        status: 'flagged_ai'
      };
    }
    if (effectiveScenario === 'household' && idx === 0) {
      return {
        index: idx,
        isAI: false,
        isHousehold: true,
        assessment: `Image ${idx + 1} is a personal household photo showing a family member and pets in a home backyard setting. It violates academic/project data constraints.`,
        status: 'flagged_household'
      };
    }
    return {
      index: idx,
      isAI: false,
      isHousehold: false,
      assessment: `Image ${idx + 1} is a validated diagram showing correct project data and scientific graphs related to the report text.`,
      status: 'valid'
    };
  });

  let score = 85;
  let summary = `The report "${filename}" has been evaluated. The textual data is cohesive, the research outline is correct, and all images are verified as authentic field evidence.`;
  let dataAssessment = "The reported experimental values conform to reference specifications. The charts correctly correspond to the text logs.";
  let remarks = "Excellent documentation. The student demonstrates a strong understanding of experimental validation methodologies.";

  if (effectiveScenario === 'ai') {
    score = 0;
    summary = `CRITICAL FAILURE: The report "${filename}" has been graded 0.0 marks. Image 1 was flagged as an AI-generated image. Academic submissions require authentic photographs or custom diagrams rather than synthetic illustrations.`;
    dataAssessment = "Submission compliance checks failed: AI synthetic imagery detected in report diagrams. Grading aborted.";
    remarks = "Resubmission required with authentic physical photographs. The student must redo the experiment documentation without generative tools.";
  } else if (effectiveScenario === 'household') {
    score = 0;
    summary = `CRITICAL FAILURE: The report "${filename}" has been graded 0.0 marks. Image 1 was flagged as a household/family image. Academic report guidelines mandate professional field data images rather than private domestic photographs.`;
    dataAssessment = "Submission compliance checks failed: Casual/family portraiture found in place of technical charts. Grading aborted.";
    remarks = "Resubmission required. Student must replace personal snapshots with appropriate experiment diagrams or charts.";
  }

  return {
    score,
    summary,
    dataAssessment,
    remarks,
    images: imagesAssessment
  };
}

export async function evaluateReport({ 
  filename, 
  text, 
  images, 
  geminiApiKey, 
  openaiApiKey, 
  anthropicApiKey, 
  blackboxApiKey, 
  engine = 'gemini', 
  simulationScenario = 'valid' 
}) {
  // Try to call the Python FastAPI backend
  try {
    const response = await fetch('/api/grade', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filename,
        text,
        images,
        apiKey: geminiApiKey,
        geminiApiKey,
        openaiApiKey,
        anthropicApiKey,
        blackboxApiKey,
        engine,
        simulationScenario
      })
    });

    if (response.ok) {
      const data = await response.json();
      return data;
    } else {
      console.warn("Python backend returned non-ok status, falling back to client-side evaluation.");
    }
  } catch (err) {
    console.warn("Python backend could not be reached, falling back to client-side evaluation. Error:", err.message);
  }

  // Fallback to original client-side simulation or API call
  const detectedScenario = autoDetectScenario(text, filename);
  const activeScenario = detectedScenario || simulationScenario;

  if (engine.toLowerCase() === 'compare') {
    const comparison = {};
    const models = ['gemini', 'chatgpt', 'claude', 'blackbox'];
    for (const m of models) {
      comparison[m] = await evaluateSimulation(filename, activeScenario, images.length);
      comparison[m].summary = `(Simulation Fallback) ${comparison[m].summary}`;
    }
    return {
      engine: 'compare',
      comparison
    };
  }

  let activeKey = '';
  if (engine === 'gemini') activeKey = geminiApiKey;
  else if (engine === 'chatgpt') activeKey = openaiApiKey;
  else if (engine === 'claude') activeKey = anthropicApiKey;
  else if (engine === 'blackbox') activeKey = blackboxApiKey;

  if (activeKey && activeKey.trim() !== '') {
    try {
      if (engine === 'gemini') {
        return await evaluateWithGemini(text, images, activeKey);
      }
      const simResult = await evaluateSimulation(filename, activeScenario, images.length);
      simResult.summary = `(Client-side direct call fallback) ${simResult.summary}`;
      return simResult;
    } catch (err) {
      console.error("Client-side API call failed, falling back to simulation: ", err);
      const simResult = await evaluateSimulation(filename, activeScenario, images.length);
      simResult.summary = `(API Error Fallback) ${simResult.summary} [Error details: ${err.message}]`;
      return simResult;
    }
  } else {
    return await evaluateSimulation(filename, activeScenario, images.length);
  }
}
