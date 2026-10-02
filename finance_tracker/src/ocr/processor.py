from paddleocr import PaddleOCR
from typing import List, Dict, Optional
from PIL import Image
import io
from finance_tracker.config.config import USE_GPU


class OCRProcessor:
    def __init__(self, use_gpu: bool = USE_GPU, lang: str = "en"):
        self.use_gpu = use_gpu
        self.lang = lang
        self.ocr = PaddleOCR(
            use_angle_cls=True, lang=lang, use_gpu=use_gpu, show_log=False
        )

    def process_image(self, image_path: str) -> Dict:
        try:
            result = self.ocr.ocr(image_path, cls=True)

            if not result or not result[0]:
                return {"success": False, "text": "", "error": "No text detected"}

            text_lines = []
            confidence_scores = []
            bounding_boxes = []

            for line in result[0]:
                if line:
                    bbox = line[0]
                    text_info = line[1]
                    text = text_info[0]
                    confidence = text_info[1]

                    text_lines.append(text)
                    confidence_scores.append(confidence)
                    bounding_boxes.append(bbox)

            full_text = "\n".join(text_lines)
            avg_confidence = (
                sum(confidence_scores) / len(confidence_scores)
                if confidence_scores
                else 0
            )

            return {
                "success": True,
                "text": full_text,
                "text_lines": text_lines,
                "confidence_scores": confidence_scores,
                "bounding_boxes": bounding_boxes,
                "average_confidence": avg_confidence,
                "line_count": len(text_lines),
            }

        except Exception as e:
            return {"success": False, "text": "", "error": str(e)}

    def process_image_bytes(self, image_bytes: bytes) -> Dict:
        try:
            image = Image.open(io.BytesIO(image_bytes))

            temp_path = "/tmp/temp_ocr_image.png"
            image.save(temp_path)

            result = self.process_image(temp_path)

            import os

            os.remove(temp_path)

            return result

        except Exception as e:
            return {"success": False, "text": "", "error": str(e)}

    def extract_text_with_confidence(
        self, image_path: str, min_confidence: float = 0.5
    ) -> str:
        result = self.process_image(image_path)

        if not result["success"]:
            return ""

        text_lines = result["text_lines"]
        confidence_scores = result["confidence_scores"]

        filtered_lines = [
            text
            for text, conf in zip(text_lines, confidence_scores)
            if conf >= min_confidence
        ]

        return "\n".join(filtered_lines)

    def get_text_regions(self, image_path: str) -> List[Dict]:
        result = self.process_image(image_path)

        if not result["success"]:
            return []

        regions = []
        text_lines = result["text_lines"]
        confidence_scores = result["confidence_scores"]
        bounding_boxes = result["bounding_boxes"]

        for i, (text, conf, bbox) in enumerate(
            zip(text_lines, confidence_scores, bounding_boxes)
        ):
            regions.append(
                {"text": text, "confidence": conf, "bounding_box": bbox, "index": i}
            )

        return regions


class OCRFactory:
    @staticmethod
    def create_processor(use_gpu: bool = USE_GPU, lang: str = "en") -> OCRProcessor:
        return OCRProcessor(use_gpu=use_gpu, lang=lang)
