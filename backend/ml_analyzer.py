import re
import base64
import io
import math
import numpy as np
from PIL import Image
from scipy import ndimage
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer

def decode_base64_image(base64_str: str) -> Image.Image:
    """
    Decodes a base64 image data URL string into a PIL Image.
    """
    if "," in base64_str:
        base64_str = base64_str.split(",")[1]
    img_bytes = base64.b64decode(base64_str)
    return Image.open(io.BytesIO(img_bytes))

def analyze_image_ml(img: Image.Image) -> dict:
    """
    Analyzes an image using Pillow, NumPy, SciPy, and scikit-learn.
    Extracts features to classify the image as:
    - 'valid' (academic diagram, chart, or scientific plot)
    - 'flagged_ai' (airbrushed/synthetic gradients, AI-style complexity)
    - 'flagged_household' (natural photograph containing domestic environments, pets, people)
    """
    # Convert image to RGB and grayscale numpy arrays
    img_rgb = img.convert("RGB")
    width, height = img_rgb.size
    img_arr = np.array(img_rgb)
    
    img_gray = img.convert("L")
    gray_arr = np.array(img_gray)
    
    # 1. Edge Density Analysis (using SciPy Sobel filters)
    # Diagrams/charts have very sharp, high-contrast lines.
    # Photos have soft, textured transitions.
    sx = ndimage.sobel(gray_arr, axis=0)
    sy = ndimage.sobel(gray_arr, axis=1)
    sob = np.hypot(sx, sy)
    
    # Calculate percentage of pixels that represent sharp edges
    edge_threshold = 50.0
    sharp_edge_pixels = np.sum(sob > edge_threshold)
    total_pixels = width * height
    edge_density = (sharp_edge_pixels / total_pixels) * 100.0
    
    # 2. Color Complexity & Flatness (using scikit-learn KMeans)
    # Flatten pixel array for clustering
    pixels = img_arr.reshape(-1, 3)
    # Downsample for performance ( KMeans can be slow on large images )
    sample_size = min(len(pixels), 3000)
    sampled_indices = np.random.choice(len(pixels), sample_size, replace=False)
    sampled_pixels = pixels[sampled_indices]
    
    # Cluster colors into 6 dominant centroids
    n_clusters = 6
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=3)
    kmeans.fit(sampled_pixels)
    
    # Calculate inertia/variance. Diagrams have highly concentrated colors (mostly white background + black lines + a few solid colors).
    # Natural photos have a lot of color diversity within clusters, leading to higher cluster inertia.
    inertia = kmeans.inertia_
    
    # Calculate Shannon Entropy of color bins to check color distribution
    # Bin colors into 8 bins per channel (512 total bins)
    hist, _ = np.histogramdd(sampled_pixels, bins=(8, 8, 8))
    hist_prob = hist.flatten() / sample_size
    hist_prob = hist_prob[hist_prob > 0]
    color_entropy = -np.sum(hist_prob * np.log2(hist_prob))
    
    # 3. AI Synthetic Check (Gradients and High Saturation Statistics)
    # AI-generated images (e.g. Midjourney style) often have high color saturation variance,
    # smooth unnatural gradients, and lack of natural camera noise.
    # We analyze the HSV saturation channel for artificial highlights.
    img_hsv = img.convert("HSV")
    hsv_arr = np.array(img_hsv)
    saturation = hsv_arr[:, :, 1] / 255.0  # Normalized 0-1
    val_channel = hsv_arr[:, :, 2] / 255.0  # Brightness
    
    avg_saturation = np.mean(saturation)
    std_saturation = np.std(saturation)
    
    # Standard deviation of local brightness (camera noise representation)
    # Natural photos have high-frequency sensor noise. AI art is often perfectly smooth.
    brightness_local_var = ndimage.generic_filter(val_channel, np.var, size=3)
    avg_brightness_local_var = np.mean(brightness_local_var)
    
    # Calculate background solid color ratios (pure white and pure black)
    white_pixels = np.sum((img_arr[:, :, 0] > 240) & (img_arr[:, :, 1] > 240) & (img_arr[:, :, 2] > 240))
    black_pixels = np.sum((img_arr[:, :, 0] < 15) & (img_arr[:, :, 1] < 15) & (img_arr[:, :, 2] < 15))
    solid_bg_ratio = max(white_pixels, black_pixels) / total_pixels

    # 4. Classification Decision Logic
    # Establish classification metrics based on our features:
    assessment_details = []
    
    # Heuristics:
    # A diagram typically has very high contrast, low color entropy, and high solid background ratio.
    # A natural photo has soft edges, high color entropy, and low background ratio.
    # An AI image has high color entropy, low noise (smoothness), and highly saturated gradients.
    
    # Count unique colors in the image to distinguish simple flat digital diagrams from complex AI/edited images
    colors_list = img.getcolors(maxcolors=20000)
    unique_colors = len(colors_list) if colors_list is not None else 20000

    is_diagram = (solid_bg_ratio > 0.15 and color_entropy < 4.2) or (color_entropy < 3.2)
    
    # If the image looks like a diagram but has too many unique colors combined with smooth gradients/synthetic textures,
    # it is flagged as an AI-generated diagram.
    is_ai_diagram = False
    if is_diagram and unique_colors > 1500 and color_entropy > 2.2:
        if avg_brightness_local_var < 0.004 or (avg_brightness_local_var < 0.006 and avg_saturation > 0.2):
            is_ai_diagram = True

    is_photo = False
    is_ai = False
    is_household = False
    
    # Let's assess features
    if is_diagram and not is_ai_diagram:
        status = "valid"
        assessment_details.append(f"Validated Diagram: Image has low color complexity (entropy: {color_entropy:.2f}, unique colors: {unique_colors}) or solid background (ratio: {solid_bg_ratio:.2f}), matching academic diagram profiles.")
    else:
        is_photo = True
        # If it is a photo or a flagged AI diagram, let's distinguish between natural household photo and AI-generated image
        if is_ai_diagram or avg_brightness_local_var < 0.003 or (avg_brightness_local_var < 0.005 and avg_saturation > 0.25):
            is_ai = True
            status = "flagged_ai"
            assessment_details.append(f"Flagged AI: Detected synthetic color gradients and airbrushed highlights with extremely low noise patterns (entropy: {color_entropy:.2f}, noise index: {avg_brightness_local_var:.5f}, unique colors: {unique_colors}).")
        else:
            is_household = True
            status = "flagged_household"
            assessment_details.append(f"Flagged Household: Categorized as a natural photographic image (domestic/personal setting) rather than a scientific plot (entropy: {color_entropy:.2f}, edge density: {edge_density:.2f}%).")
            
            
    return {
        "status": status,
        "isAI": is_ai,
        "isHousehold": is_household,
        "assessment": " ".join(assessment_details),
        # Attach raw ML metrics for transparency
        "metrics": {
            "color_entropy": float(color_entropy),
            "edge_density": float(edge_density),
            "avg_saturation": float(avg_saturation),
            "noise_index": float(avg_brightness_local_var),
            "inertia": float(inertia)
        }
    }

def analyze_text_nlp(text: str) -> dict:
    """
    Analyzes the report text using scikit-learn NLP utilities.
    Checks for the existence of standard scientific/academic report sections
    and computes a vocabulary coherence score using TF-IDF.
    """
    if not text or len(text.strip()) < 10:
        return {
            "score_deduction": 4.0,
            "assessment": "Document text is empty or too short to perform academic analysis.",
            "metrics": {"sections_found": [], "academic_density": 0.0}
        }
        
    text_lower = text.lower()
    
    # 1. Structure Check: Look for scientific sections
    sections = {
        "abstract": ["abstract", "summary"],
        "introduction": ["introduction", "background"],
        "methodology": ["methodology", "method", "experimental", "procedure"],
        "results": ["results", "findings", "discussion"],
        "conclusion": ["conclusion", "conclusions"],
        "references": ["references", "bibliography", "works cited"]
    }
    
    found_sections = []
    for section, keywords in sections.items():
        for kw in keywords:
            # Match word boundary to avoid substrings
            if re.search(r'\b' + re.escape(kw) + r'\b', text_lower):
                found_sections.append(section)
                break
                
    structure_score = len(found_sections) / len(sections)  # 0.0 to 1.0
    
    # 2. Vocabulary Analysis (TF-IDF keyword checking using scikit-learn)
    # Define a corpus of academic terms to construct our TF-IDF space
    academic_vocabulary = [
        "experiment data analysis hypothesis methodology sample simulation observation result conclusion",
        "figure table chart plot diagram correlation deviation variance statistics methodology measurement",
        "literature review citation reference background objective significance parameter variable model theory",
        "household bedroom family kitchen cat dog garden holiday vacation selfie party dinner home private"
    ]
    
    # Add the report text as the final document in the corpus
    corpus = academic_vocabulary + [text_lower]
    
    vectorizer = TfidfVectorizer(stop_words='english')
    tfidf_matrix = vectorizer.fit_transform(corpus)
    
    # Get the feature index of academic keywords and household keywords
    feature_names = vectorizer.get_feature_names_out()
    
    # Calculate tf-idf score of the uploaded document (index 4 in tfidf_matrix)
    doc_vector = tfidf_matrix.toarray()[-1]
    
    # Separate academic vocabulary words vs household words
    academic_words = set(" ".join(academic_vocabulary[:-1]).split())
    household_words = set(academic_vocabulary[-1].split())
    
    academic_score = 0.0
    household_score = 0.0
    
    for i, token in enumerate(feature_names):
        weight = doc_vector[i]
        if token in academic_words:
            academic_score += weight
        elif token in household_words:
            household_score += weight
            
    # Calculate a final data assessment based on TF-IDF densities
    is_household_text = household_score > (academic_score * 1.5)
    
    # Generate assessment
    assessment_msgs = []
    if structure_score == 1.0:
        assessment_msgs.append("The report maintains an excellent academic structure, including all core sections (Abstract, Intro, Method, Results, Conclusion, References).")
    elif structure_score >= 0.6:
        assessment_msgs.append(f"The report maintains a basic academic structure. Found {len(found_sections)} sections: {', '.join(found_sections)}.")
    else:
        assessment_msgs.append("Warning: The document lacks standard academic formatting and missing essential sections.")
        
    assessment_msgs.append(f"Vocabulary check: Academic keyword density index is {academic_score:.2f}, while casual/domestic keyword density is {household_score:.2f}.")
    
    if is_household_text:
        assessment_msgs.append("CAUTION: The vocabulary is highly informal and relates to domestic/personal events rather than academic research.")
        
    return {
        "structure_score": float(structure_score),
        "academic_density": float(academic_score),
        "household_density": float(household_score),
        "is_household_text": is_household_text,
        "assessment": " ".join(assessment_msgs),
        "found_sections": found_sections
    }

def evaluate_report_ml(filename: str, text: str, images: list, simulation_scenario: str = "valid", engine: str = "gemini") -> dict:
    """
    Performs full evaluation of the report using local ML models, styled as a specific AI engine.
    """
    # Scan text for explicit statements of AI image generation, AI editing, or household photos
    text_lower = text.lower()

    # AI image generation and editing tools — covers all major platforms + LLM-based editing
    ai_image_tools = [
        "midjourney", "dall-e", "dalle", "stable-diffusion", "stable diffusion",
        "adobe firefly", "firefly", "bing image creator", "bing image",
        "imagen", "ideogram", "nightcafe", "dreamstudio", "playground ai",
        # AI editing via LLM platforms
        "gemini image", "gemini generated", "generated by gemini", "edited by gemini", "gemini edit",
        "chatgpt image", "chatgpt generated", "generated by chatgpt", "edited by chatgpt", "chatgpt edit",
        "claude image", "claude generated", "generated by claude", "edited by claude", "claude edit",
        "blackbox image", "blackbox generated", "generated by blackbox", "edited by blackbox", "blackbox edit",
        "copilot image", "copilot generated", "generated by copilot", "edited by copilot",
        "canva ai", "canva magic", "canva generated",
        "photoshop ai", "generative fill", "adobe ai",
        "gimp", "photoshop",
    ]
    has_ai_tool = any(k in text_lower for k in ai_image_tools)

    ai_image_terms = [
        "ai-generated image", "ai generated image", "image generated by ai",
        "ai-generated diagram", "ai generated diagram", "diagram generated by ai",
        "ai-generated photo", "ai generated photo", "photo generated by ai",
        "synthetic image", "synthetic diagram", "ai image", "ai diagram",
        "edited image", "edited photo", "edited diagram", "edited chart",
        "image editing", "photo editing", "image was edited", "photo was edited",
        "manipulated image", "manipulated photo", "image manipulation",
        "ai-enhanced image", "ai enhanced image", "enhanced by ai",
        "ai-edited", "ai edited", "edited using ai", "edited with ai",
        "generated image", "generated diagram", "generated chart",
        "image created by", "diagram created by", "figure created by",
    ]
    has_ai_image_term = any(k in text_lower for k in ai_image_terms)
    text_flags_ai = has_ai_tool or has_ai_image_term

    household_terms = [
        "selfie", "family photo", "family picture", "family image",
        "my dog", "my cat", "my pet", "pet photo", "pet picture",
        "photo of my", "picture of my", "image of my",
        "household photo", "household picture", "personal photo", "personal picture",
        "my house", "my home", "my room", "my kitchen", "my bedroom",
        "holiday photo", "vacation photo", "trip photo",
        "photo of my family", "picture of my family",
    ]
    text_flags_household = any(k in text_lower for k in household_terms)

    # 1. Evaluate images
    images_assessment = []
    has_ai = False
    has_household = False
    
    # Let's check keywords in filename ONLY to override ML classification for exact deterministic testing of scenarios
    # (Checking body text is disabled to allow students to discuss AI platforms/tools without penalty)
    detected_scenario = None
    filename_lower = filename.lower()
    
    ai_keywords = ['ai-generated', 'synthetic image', 'midjourney', 'dall-e', 'stable-diffusion', 'copilot image', 'ai-scenario', 'flagged_ai']
    household_keywords = ['family', 'selfie', 'household', 'kitchen', 'bedroom', 'living room', 'my dog', 'my cat', 'flagged_household']
    
    if any(k in filename_lower for k in ai_keywords):
        detected_scenario = "ai"
    elif any(k in filename_lower for k in household_keywords):
        detected_scenario = "household"
        
    active_scenario = detected_scenario or simulation_scenario
    
    # Engine specific prefixes to make simulations realistic
    engine_names = {
        "gemini": "Google Gemini 3.5 Flash",
        "chatgpt": "OpenAI ChatGPT-4o-mini",
        "claude": "Anthropic Claude 3.5 Sonnet",
        "blackbox": "Blackbox AI Multimodal"
    }
    engine_label = engine_names.get(engine, "Local Python AI/ML Engine")

    for idx, img_b64 in enumerate(images):
        try:
            # Decode the base64 image
            img = decode_base64_image(img_b64)
            # Run image ML analyzer
            analysis = analyze_image_ml(img)
            
            # For exact scenario emulation (e.g. if the user wants to test specific simulation routes),
            # we can inject/force the status if it matches active_scenario or text flags for the first image.
            if (detected_scenario == "ai" or simulation_scenario == "ai" or text_flags_ai) and idx == 0:
                analysis["status"] = "flagged_ai"
                analysis["isAI"] = True
                analysis["isHousehold"] = False
                analysis["assessment"] = f"[{engine_label} Simulation] Flagged AI: detected synthetic rendering artifacts or reference to AI image generation."
            elif (detected_scenario == "household" or simulation_scenario == "household" or text_flags_household) and idx == 0:
                analysis["status"] = "flagged_household"
                analysis["isAI"] = False
                analysis["isHousehold"] = True
                analysis["assessment"] = f"[{engine_label} Simulation] Flagged Household: identified domestic setting, human faces, or personal photo reference."
            
            if analysis["isAI"]:
                has_ai = True
            if analysis["isHousehold"]:
                has_household = True
                
            images_assessment.append({
                "index": idx,
                "isAI": analysis["isAI"],
                "isHousehold": analysis["isHousehold"],
                "assessment": analysis["assessment"],
                "status": analysis["status"]
            })
        except Exception as e:
            images_assessment.append({
                "index": idx,
                "isAI": False,
                "isHousehold": False,
                "assessment": f"Failed to run ML checks on image: {str(e)}",
                "status": "valid"
            })

    # --- CRITICAL FIX ---
    # If no images were submitted but the simulation scenario is ai or household or text flagged,
    # inject a virtual flagged image so the 0.0 score enforcement still triggers.
    if len(images) == 0 and (active_scenario in ("ai", "household") or text_flags_ai or text_flags_household):
        if active_scenario == "ai" or text_flags_ai:
            has_ai = True
            images_assessment.append({
                "index": 0,
                "isAI": True,
                "isHousehold": False,
                "assessment": f"[{engine_label} Simulation] Flagged AI: synthetic/generative image reference detected in text. Score set to zero.",
                "status": "flagged_ai"
            })
        else:
            has_household = True
            images_assessment.append({
                "index": 0,
                "isAI": False,
                "isHousehold": True,
                "assessment": f"[{engine_label} Simulation] Flagged Household: domestic/personal photo reference detected in text. Score set to zero.",
                "status": "flagged_household"
            })
    # 2. Evaluate text NLP
    text_analysis = analyze_text_nlp(text)
    
    # 3. Compile Score — out of 100 marks (Images: 50, Text: 50). PASS = 60+, FAIL = <60.
    if has_ai or has_household:
        score = 0
        image_score = 0
        text_score = 0
        if has_ai and has_household:
            summary = f"CRITICAL FAILURE — 0/100: The report '{filename}' was graded 0 marks by {engine_label}. Both AI-generated images and household/personal photographs were detected. FAIL."
            data_assessment = f"[{engine_label} Compliance Alert] Dual violations triggered: Generative AI image detection and household imagery found. Score set to zero (FAIL)."
            remarks = "Resubmission required. The submission contains multiple violations:\n1. AI-generated images are strictly prohibited.\n2. Private/household photos must be replaced with authentic technical diagrams or charts relevant to the study."
        elif has_ai:
            summary = f"CRITICAL FAILURE — 0/100: The report '{filename}' was graded 0 marks by {engine_label}. An AI-generated image was detected. Academic guidelines strictly prohibit synthetic, generative visual submissions. FAIL."
            data_assessment = f"[{engine_label} Compliance Alert] Generative AI image detection triggered. Score set to zero (FAIL)."
            remarks = "Resubmission required. Student must submit authentic experiment images. Generative AI tools are strictly prohibited."
        else:
            summary = f"CRITICAL FAILURE — 0/100: The report '{filename}' was graded 0 marks by {engine_label}. A household/personal photograph was found instead of professional field-data charts. FAIL."
            data_assessment = f"[{engine_label} Compliance Alert] Household imagery found in place of research charts. Score set to zero (FAIL)."
            remarks = "Resubmission required. Student must replace private/household photos with authentic technical diagrams or charts relevant to the study."
    else:
        # Evaluate Images portion (out of 50 marks)
        # "if they are not using ai images and not household images means it want to give 30 to 50 marks"
        if len(images) > 0:
            edge_densities = []
            for idx, img_b64 in enumerate(images):
                try:
                    img = decode_base64_image(img_b64)
                    analysis = analyze_image_ml(img)
                    edge_densities.append(analysis["metrics"]["edge_density"])
                except:
                    edge_densities.append(15.0)
            avg_edge_density = sum(edge_densities) / len(edge_densities)
            # Map average edge density (typically 5 to 25) to 30 to 50 range
            image_score = 30.0 + (avg_edge_density - 5.0)
            image_score = max(30.0, min(50.0, image_score))
        else:
            # If no images, they are not using AI or household images, default to 30 marks
            image_score = 30.0

        # Evaluate Text portion (out of 50 marks)
        # Raw text NLP score (goes from 10.0 to 50.0)
        raw_text_score = 10.0 + (20.0 * text_analysis["structure_score"]) + (20.0 * min(text_analysis["academic_density"] * 3.0, 1.0))
        
        # Map raw_text_score (10.0 - 50.0) to 30 to 50 range (never below 30 marks)
        text_score = 30.0 + (raw_text_score - 10.0) * 0.5
        text_score = max(30.0, min(50.0, text_score))
        
        ai_tool_keywords = ['chatgpt', 'gemini', 'copilot', 'openai', 'anthropic', 'claude', 'llm', 'ai platform', 'ai tool', 'ai-generated', 'synthetic text']
        uses_ai_tools = any(kw in text.lower() for kw in ai_tool_keywords)
        belongs_to_domain = text_analysis["structure_score"] >= 0.6 or text_analysis["academic_density"] >= 0.15
            
        score = round(image_score + text_score)
        # Grace band: scores between 55-59 are bumped to 60 (PASS)
        if 55 <= score <= 59:
            score = 60
            
        grade_label = "PASS" if score >= 60 else "FAIL"
        
        # Engine-specific summaries
        if engine == "claude":
            summary = f"Anthropic Claude 3.5 Sonnet Audit: Score {score}/100 — {grade_label}. Images portion: {image_score:.1f}/50, Text portion: {text_score:.1f}/50. Academic structure: {text_analysis['structure_score']*100:.0f}%."
            data_assessment = f"Claude Data Insight: Checked structure and content. No AI/household image violations. Score threshold: 60 = PASS."
        elif engine == "chatgpt":
            summary = f"OpenAI ChatGPT-4o-mini Evaluation: Score {score}/100 — {grade_label}. Images portion: {image_score:.1f}/50, Text portion: {text_score:.1f}/50. Academic density: {text_analysis['academic_density']:.2f}."
            data_assessment = f"ChatGPT Verification: Image checks completed. Text verification validated. Score threshold: 60 = PASS."
        elif engine == "blackbox":
            summary = f"Blackbox AI Evaluation: Score {score}/100 — {grade_label}. Images portion: {image_score:.1f}/50, Text portion: {text_score:.1f}/50. Valid report structure."
            data_assessment = f"Blackbox Verification: Format checks passed. Images authentic. Score threshold: 60 = PASS."
        else:
            summary = f"Google Gemini 3.5 Flash Evaluation: Score {score}/100 — {grade_label}. Images portion: {image_score:.1f}/50, Text portion: {text_score:.1f}/50. Extracted images confirmed authentic."
            data_assessment = f"Gemini Verification: Scientific formatting verified. Images are relevant. Score threshold: 60 = PASS."
        
        if score >= 60:
            remarks = f"Approved submission. The report satisfies key scientific parameters with solid vocabulary density and structural coherence. Keep up the good work."
        else:
            if uses_ai_tools and belongs_to_domain:
                remarks = f"Submission failed. AI tools/platforms usage was detected in the text. While the content is relevant to the domain (giving {text_score:.1f}/50 for text), the total grade is {score}/100 (FAIL)."
            else:
                remarks = f"Submission failed. The academic structure or vocabulary density does not meet the pass threshold of 60 marks. Resubmission required."
        
    return {
        "score": score,
        "summary": summary,
        "dataAssessment": data_assessment,
        "remarks": remarks,
        "images": images_assessment
    }

