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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

  // Formulate the strict system prompt
  const systemPrompt = `You are an expert academic examiner and document authenticator.
Your job is to grade the uploaded student report out of 100 marks, checking both the textual data and the attached images.

CRITICAL RULES FOR GRADING:
1. Marks Breakdown (Total 100 marks):
   - Images Score: Maximum 50 marks.
   - Text Score: Maximum 50 marks.
2. AI-generated, Edited, and Household Images check (Images Score: 50 marks):
   - If any image in the report is AI-generated (synthetic rendering, Midjourney, DALL-E, etc.), has been edited/manipulated (Photoshop, synthetic overlays, image editors), OR is a household photo (faces, selfies, pets, home context), you MUST flag the image status accordingly and set the final report "score" to 0 marks.
   - If there are NO AI-generated/edited images and NO household/family images (meaning they are authentic scientific diagrams or no images at all), you MUST award between 30 and 50 marks for the image portion.
3. AI-generated Text check (Text Score: 50 marks):
   - If the student utilizes AI text/tools (ChatGPT, Gemini, Claude, etc.) and the text is relevant and belongs to the scientific domain/topic of the report, you MUST award between 30 and 50 marks for the text portion.
   - Otherwise, grade the text out of 50 marks based on academic structure, quality, and writing relevance.
4. Final Score:
   - The final score is the sum of the Images Score (out of 50) and the Text Score (out of 50). If any image is flagged as AI or Household, the final score must be 0.
   - GRACE BAND RULE: If the final score is between 55 and 59 (inclusive), round it up to 60 (PASS).
5. Image references in text check:
   If the student report text explicitly states or implies that they generated their diagrams/images using AI tools (e.g. Midjourney, DALL-E) or that they used household/personal photographs (e.g. photos of family, pets, rooms) instead of authentic scientific/experimental data, you MUST flag those images as "flagged_ai" or "flagged_household" respectively and set the final report "score" to 0.
 
Your response MUST be a single, valid JSON object following this exact schema:
{
  "score": number, // out of 100. MUST be 0 if any image is AI or household.
  "summary": "Detailed overall summary explaining the grading breakdown (Images out of 50, Text out of 50) and feedback...",
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
  // Let's check keywords in filename ONLY to override ML classification for exact deterministic testing of scenarios
  // (Checking body text is disabled to allow students to discuss AI platforms/tools without penalty)
  const filenameLower = filename.toLowerCase();
  
  // Keywords indicating AI images
  const aiKeywords = [
    'ai-generated', 'synthetic image', 'midjourney', 'dall-e', 'stable diffusion', 
    'generated diagram', 'artificial rendering', 'copilot image', 'ai diagram', 'ai-scenario', 'flagged_ai'
  ];
  
  // Keywords indicating Household/Family images
  const householdKeywords = [
    'family', 'selfie', 'household', 'my home', 'my house', 'kitchen', 'bedroom', 
    'living room', 'mother', 'father', 'sister', 'brother', 'family member',
    'my dog', 'my cat', 'pet photo', 'domestic scene', 'flagged_household'
  ];

  if (aiKeywords.some(keyword => filenameLower.includes(keyword))) {
    return 'ai';
  }
  
  if (householdKeywords.some(keyword => filenameLower.includes(keyword))) {
    return 'household';
  }

  return null;
}

/**
 * Simulates evaluation for demo purposes.
 * @param {string} filename 
 * @param {string} scenario 
 * @param {number} numImages 
 * @param {string} text 
 * @returns {Promise<any>}
 */
async function evaluateSimulation(filename, scenario, numImages, text = '') {
  // Wait a short bit to simulate loading
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Scan text for explicit references to AI image generation, editing, or household photos
  const textLower = (text || '').toLowerCase();
  const hasAiTool = ["midjourney", "dall-e", "stable-diffusion", "stable diffusion", "photoshop", "gimp", "canva"].some(k => textLower.includes(k));
  const hasAiImageTerm = [
    "ai-generated image", "ai generated image", "image generated by ai", 
    "synthetic image", "ai diagram", "ai-generated diagram", "ai generated diagram",
    "edited image", "edited photo", "edited diagram", "edited chart", 
    "image editing", "photo editing", "manipulated image", "manipulated photo"
  ].some(k => textLower.includes(k));
  const textFlagsAI = hasAiTool || hasAiImageTerm;

  const householdTerms = ["selfie", "family photo", "family picture", "my dog", "my cat", "pet photo", "photo of my", "picture of my", "household photo", "personal photo"];
  const textFlagsHousehold = householdTerms.some(k => textLower.includes(k));

  // If there are no images, we shouldn't trigger image violation simulation flags unless specified or text flagged
  const effectiveAI = scenario === 'ai' || textFlagsAI;
  const effectiveHousehold = scenario === 'household' || textFlagsHousehold;
  const effectiveScenario = numImages === 0 ? 'valid' : scenario;

  const virtualLength = Math.max(numImages, (effectiveAI || effectiveHousehold) ? 1 : 0);

  const imagesAssessment = Array.from({ length: virtualLength }).map((_, idx) => {
    if (effectiveAI && idx === 0) {
      return {
        index: idx,
        isAI: true,
        isHousehold: false,
        assessment: `Image ${idx + 1} shows artificial textures, unrealistic color blending, or text indicating AI image generation.`,
        status: 'flagged_ai'
      };
    }
    if (effectiveHousehold && idx === 0) {
      return {
        index: idx,
        isAI: false,
        isHousehold: true,
        assessment: `Image ${idx + 1} is a personal household photo or contains references to domestic settings, violating academic rules.`,
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

  const hasAI = imagesAssessment.some(img => img.isAI);
  const hasHousehold = imagesAssessment.some(img => img.isHousehold);

  let imageScore = 0;
  if (!hasAI && !hasHousehold) {
    // If not using AI and not household images, give 30 to 50 marks
    imageScore = 30 + Math.min(20, numImages * 10);
  }

  // Calculate text score out of 50 marks (always between 30 and 50 marks)
  const aiToolKeywords = ['chatgpt', 'gemini', 'copilot', 'openai', 'anthropic', 'claude', 'llm', 'ai platform', 'ai tool', 'ai-generated', 'synthetic text'];
  const usesAiTools = text && aiToolKeywords.some(kw => text.toLowerCase().includes(kw));
  const belongsToDomain = !text || text.toLowerCase().includes('methodology') || text.toLowerCase().includes('results') || text.toLowerCase().includes('experiment');

  let textScore = 40; // Default text score out of 50
  if (text) {
    const baseTextScore = 10 + Math.min(40, text.split(' ').length / 10);
    textScore = 30 + (baseTextScore - 10) * 0.5;
    textScore = Math.max(30, Math.min(50, textScore));
  }

  let score = 0;
  let summary = '';
  let dataAssessment = '';
  let remarks = '';

  if (hasAI || hasHousehold) {
    score = 0;
    if (hasAI && hasHousehold) {
      summary = `CRITICAL FAILURE — 0/100: Both AI-generated images and household/personal photographs were detected. FAIL.`;
      dataAssessment = `Dual violations triggered: Generative AI image detection and household imagery found. Score set to zero (FAIL).`;
      remarks = `Resubmission required. AI-generated images and private household photos must be replaced with authentic experiment data.`;
    } else if (hasAI) {
      summary = `CRITICAL FAILURE — 0/100: An AI-generated image was detected. Academic guidelines strictly prohibit synthetic, generative visual submissions. FAIL.`;
      dataAssessment = `Generative AI image detection triggered. Score set to zero (FAIL).`;
      remarks = `Resubmission required. Student must submit authentic experiment images. Generative AI tools are strictly prohibited.`;
    } else {
      summary = `CRITICAL FAILURE — 0/100: A household/personal photograph was found instead of professional field-data charts. FAIL.`;
      dataAssessment = `Household imagery found in place of research charts. Score set to zero (FAIL).`;
      remarks = `Resubmission required. Student must replace private/household photos with authentic technical diagrams or charts.`;
    }
  } else {
    score = Math.round(imageScore + textScore);
    // Grace band: scores between 55-59 are bumped to 60 (PASS)
    if (score >= 55 && score <= 59) {
      score = 60;
    }
    const gradeLabel = score >= 60 ? "PASS" : "FAIL";
    summary = `Report evaluation complete. Score breakdown: Images portion = ${imageScore}/50 marks, Text portion = ${textScore}/50 marks. Total score: ${score}/100 — ${gradeLabel}.`;
    dataAssessment = `Verified Authentic: No AI-generated or household images detected. Text structure matches domain criteria.`;
    if (score >= 60) {
      remarks = `Approved submission. The report satisfies key scientific parameters with solid vocabulary density and structural coherence. Keep up the good work.`;
    } else {
      if (usesAiTools && belongsToDomain) {
        remarks = `Submission failed. AI tools/platforms usage was detected in the text body. While the content is relevant to the domain (giving ${textScore}/50 for text), the total grade is ${score}/100 (FAIL).`;
      } else {
        remarks = `Submission failed. The academic structure or vocabulary density does not meet the pass threshold of 60 marks. Resubmission required.`;
      }
    }
  }

  return {
    score,
    summary,
    dataAssessment,
    remarks,
    images: imagesAssessment
  };
}

function enforceZeroScoreOnViolations(result) {
  if (!result) return result;
  
  const applyEnforcement = (data) => {
    if (!data) return;
    const hasAI = data.images?.some(img => img.isAI || img.status === 'flagged_ai');
    const hasHousehold = data.images?.some(img => img.isHousehold || img.status === 'flagged_household');
    
    if (hasAI || hasHousehold) {
      data.score = 0;
      
      let violations = [];
      if (hasAI) violations.push("AI-generated images");
      if (hasHousehold) violations.push("household/personal photographs");
      const violationDesc = violations.join(" and ");
      
      data.summary = `CRITICAL FAILURE — 0/100: The report was graded 0 marks. ${violationDesc.charAt(0).toUpperCase() + violationDesc.slice(1)} detected. FAIL.`;
      data.dataAssessment = `[Compliance Alert] Violation triggered: ${violationDesc} found. Score set to zero (FAIL).`;
      data.remarks = `Resubmission required. Student must replace the flagged images with authentic technical diagrams or charts. ${hasAI ? "Generative AI tools are strictly prohibited." : ""}`;
    }
  };

  if (result.comparison) {
    Object.keys(result.comparison).forEach(model => {
      applyEnforcement(result.comparison[model]);
    });
  } else {
    applyEnforcement(result);
  }
  return result;
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
      return enforceZeroScoreOnViolations(data);
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
      comparison[m] = await evaluateSimulation(filename, activeScenario, images.length, text);
      comparison[m].summary = `(Simulation Fallback) ${comparison[m].summary}`;
    }
    return enforceZeroScoreOnViolations({
      engine: 'compare',
      comparison
    });
  }

  let activeKey = '';
  if (engine === 'gemini') activeKey = geminiApiKey;
  else if (engine === 'chatgpt') activeKey = openaiApiKey;
  else if (engine === 'claude') activeKey = anthropicApiKey;
  else if (engine === 'blackbox') activeKey = blackboxApiKey;

  if (activeKey && activeKey.trim() !== '') {
    try {
      if (engine === 'gemini') {
        const data = await evaluateWithGemini(text, images, activeKey);
        return enforceZeroScoreOnViolations(data);
      }
      const simResult = await evaluateSimulation(filename, activeScenario, images.length, text);
      simResult.summary = `(Client-side direct call fallback) ${simResult.summary}`;
      return enforceZeroScoreOnViolations(simResult);
    } catch (err) {
      console.error("Client-side API call failed, falling back to simulation: ", err);
      const simResult = await evaluateSimulation(filename, activeScenario, images.length, text);
      simResult.summary = `(API Error Fallback) ${simResult.summary} [Error details: ${err.message}]`;
      return enforceZeroScoreOnViolations(simResult);
    }
  } else {
    const simResult = await evaluateSimulation(filename, activeScenario, images.length, text);
    return enforceZeroScoreOnViolations(simResult);
  }
}
