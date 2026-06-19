import sys
import os
import numpy as np
from PIL import Image, ImageDraw

# Ensure parent directory is in path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.ml_analyzer import analyze_image_ml, analyze_text_nlp, evaluate_report_ml

def create_mock_diagram() -> Image.Image:
    """
    Creates a mock academic diagram: a white canvas with sharp black grids and red lines.
    """
    img = Image.new("RGB", (300, 300), "white")
    draw = ImageDraw.Draw(img)
    # Draw grid lines (sharp edges)
    for i in range(0, 300, 30):
        draw.line([(i, 0), (i, 300)], fill="lightgray", width=1)
        draw.line([(0, i), (300, i)], fill="lightgray", width=1)
    # Draw plot lines
    draw.line([(50, 250), (150, 100), (250, 50)], fill="red", width=3)
    # Draw text labels
    draw.rectangle([(20, 20), (80, 40)], fill="black")
    return img

def create_mock_photo() -> Image.Image:
    """
    Creates a mock natural photo: a complex gradient with random noise.
    """
    img_arr = np.zeros((300, 300, 3), dtype=np.uint8)
    for y in range(300):
        for x in range(300):
            # Smooth gradient
            img_arr[y, x, 0] = int((x / 300.0) * 255)  # Red gradient
            img_arr[y, x, 1] = int((y / 300.0) * 255)  # Green gradient
            img_arr[y, x, 2] = 128                     # Blue constant
    # Add random pixel noise
    noise = np.random.randint(-15, 15, (300, 300, 3), dtype=np.int16)
    img_arr = np.clip(img_arr.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(img_arr)

def run_tests():
    print("=========================================")
    print("RUNNING PYBACKEND ML ANALYZER TEST SUITE")
    print("=========================================")

    # 1. Test Text NLP Analyzer
    print("\n[Test 1] Testing Text NLP Analyzer...")
    sample_text = (
        "Abstract: This project measures thermodynamic variance. "
        "Introduction: We study temperature metrics. "
        "Methodology: We set up temperature probes and logged data. "
        "Results: The variance matches predictions as shown in Figure 1. "
        "Conclusion: Probes were effective. "
        "References: Smith et al. (2024)."
    )
    text_results = analyze_text_nlp(sample_text)
    print("NLP Analysis output keys:", text_results.keys())
    print(f"Structure Score: {text_results['structure_score']:.2f}")
    print(f"Academic Density: {text_results['academic_density']:.4f}")
    print(f"Sections Found: {text_results['found_sections']}")
    assert text_results["structure_score"] == 1.0, "Expected all 6 sections to be matched"
    print("-> Test 1 PASSED!")

    # 2. Test Image ML Analyzer on Diagram
    print("\n[Test 2] Testing Image ML on Mock Diagram...")
    diagram_img = create_mock_diagram()
    diag_res = analyze_image_ml(diagram_img)
    print("Diagram Analysis Metrics:")
    for k, v in diag_res["metrics"].items():
        print(f"  - {k}: {v:.4f}")
    print(f"Inferred Status: {diag_res['status']}")
    print(f"Is AI: {diag_res['isAI']}, Is Household: {diag_res['isHousehold']}")
    assert diag_res["status"] == "valid", "Expected mock diagram to be validated"
    print("-> Test 2 PASSED!")

    # 3. Test Image ML Analyzer on Photo
    print("\n[Test 3] Testing Image ML on Mock Photo...")
    photo_img = create_mock_photo()
    photo_res = analyze_image_ml(photo_img)
    print("Photo Analysis Metrics:")
    for k, v in photo_res["metrics"].items():
        print(f"  - {k}: {v:.4f}")
    print(f"Inferred Status: {photo_res['status']}")
    print(f"Is AI: {photo_res['isAI']}, Is Household: {photo_res['isHousehold']}")
    # Mock photo has high entropy and should not be identified as a simple diagram
    assert photo_res["status"] != "valid", "Expected photographic gradient to trigger flagged status"
    print("-> Test 3 PASSED!")

    # 4. Test Full Report Evaluation Pipeline
    print("\n[Test 4] Testing Full Report Pipeline...")
    # Convert image to base64
    import io
    import base64
    buffered = io.BytesIO()
    diagram_img.save(buffered, format="JPEG")
    img_b64 = "data:image/jpeg;base64," + base64.b64encode(buffered.getvalue()).decode()
    
    pipeline_res = evaluate_report_ml(
        filename="report.pdf",
        text=sample_text,
        images=[img_b64],
        simulation_scenario="valid"
    )
    print(f"Graded Score: {pipeline_res['score']} / 5.0")
    print(f"Summary: {pipeline_res['summary']}")
    print(f"Data Assessment: {pipeline_res['dataAssessment']}")
    print(f"Images count in grading: {len(pipeline_res['images'])}")
    assert pipeline_res["score"] > 3.0, "Expected a positive score for valid report"
    print("-> Test 4 PASSED!")

    print("\n=========================================")
    print("ALL TESTS COMPLETED SUCCESSFULLY!")
    print("=========================================")

if __name__ == "__main__":
    run_tests()
