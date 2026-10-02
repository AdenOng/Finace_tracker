from typing import List, Dict, Optional
from PIL import Image
import io
import os


def _get_fitz():
    try:
        import fitz  # PyMuPDF
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "PyMuPDF is required for PDF processing. Install pymupdf to enable PDF support."
        ) from exc
    return fitz


class PDFProcessor:
    def __init__(self):
        pass

    def convert_to_images(self, pdf_path: str, dpi: int = 300) -> List[str]:
        """
        Convert PDF pages to images and save them temporarily
        Returns list of image paths
        """
        image_paths = []

        try:
            fitz = _get_fitz()
            pdf_document = fitz.open(pdf_path)

            for page_num in range(len(pdf_document)):
                page = pdf_document.load_page(page_num)

                pix = page.get_pixmap(matrix=fitz.Matrix(dpi / 72, dpi / 72))

                temp_path = f"/tmp/pdf_page_{page_num}_{os.path.basename(pdf_path)}.png"
                pix.save(temp_path)
                image_paths.append(temp_path)

            pdf_document.close()

            return image_paths

        except Exception as e:
            for path in image_paths:
                if os.path.exists(path):
                    os.remove(path)
            raise e

    def extract_text(self, pdf_path: str) -> Dict:
        """
        Extract text from PDF directly
        """
        try:
            fitz = _get_fitz()
            pdf_document = fitz.open(pdf_path)
            full_text = ""
            pages_text = []

            for page_num in range(len(pdf_document)):
                page = pdf_document.load_page(page_num)
                text = page.get_text()
                pages_text.append({"page": page_num + 1, "text": text})
                full_text += f"\n--- Page {page_num + 1} ---\n{text}\n"

            pdf_document.close()

            return {
                "success": True,
                "text": full_text,
                "full_text": full_text,
                "pages": pages_text,
                "page_count": len(pages_text),
            }

        except Exception as e:
            return {"success": False, "text": "", "error": str(e)}

    def extract_tables(self, pdf_path: str) -> List[List[List[str]]]:
        """
        Attempt to extract tables from PDF
        Returns list of tables (each table is list of rows, each row is list of cells)
        """
        try:
            fitz = _get_fitz()
            pdf_document = fitz.open(pdf_path)
            tables = []

            for page_num in range(len(pdf_document)):
                page = pdf_document.load_page(page_num)

                tabs = page.find_tables()

                for tab in tabs:
                    table_data = tab.extract()
                    tables.append({"page": page_num + 1, "table": table_data})

            pdf_document.close()

            return tables

        except Exception as e:
            print(f"Error extracting tables: {e}")
            return []

    def get_page_as_image_bytes(
        self, pdf_path: str, page_num: int = 0, dpi: int = 300
    ) -> bytes:
        """
        Get a specific page as image bytes
        """
        try:
            fitz = _get_fitz()
            pdf_document = fitz.open(pdf_path)

            if page_num >= len(pdf_document):
                raise ValueError(
                    f"Page {page_num} does not exist (PDF has {len(pdf_document)} pages)"
                )

            page = pdf_document.load_page(page_num)
            pix = page.get_pixmap(matrix=fitz.Matrix(dpi / 72, dpi / 72))

            img_bytes = pix.tobytes("png")

            pdf_document.close()

            return img_bytes

        except Exception as e:
            raise e


class DocumentProcessor:
    def __init__(self):
        self.pdf_processor = PDFProcessor()

    def process_document(self, file_path: str) -> Dict:
        """
        Process a document (PDF or image) and return extracted text
        """
        file_ext = os.path.splitext(file_path)[1].lower()

        if file_ext == ".pdf":
            result = self.pdf_processor.extract_text(file_path)
            if result.get("success"):
                text = result.get("text", "")
                if text and len(text.strip()) >= 20:
                    return result

            return self._ocr_pdf_fallback(file_path)
        elif file_ext in [".png", ".jpg", ".jpeg", ".tiff", ".bmp"]:
            return self.process_image_document(file_path)
        else:
            return {
                "success": False,
                "text": "",
                "error": f"Unsupported file format: {file_ext}",
            }

    def _ocr_pdf_fallback(self, pdf_path: str) -> Dict:
        """
        OCR fallback for scanned PDFs
        """
        image_paths = []
        try:
            image_paths = self.pdf_processor.convert_to_images(pdf_path)
            from finance_tracker.src.ocr.processor import OCRFactory

            ocr_processor = OCRFactory.create_processor()

            combined_text = []
            for image_path in image_paths:
                result = ocr_processor.process_image(image_path)
                if result.get("success"):
                    combined_text.append(result.get("text", ""))

            full_text = "\n".join([t for t in combined_text if t])

            return {
                "success": True,
                "text": full_text,
                "full_text": full_text,
                "pages": [],
                "page_count": len(image_paths),
            }
        except Exception as e:
            return {"success": False, "text": "", "error": str(e)}
        finally:
            for path in image_paths:
                try:
                    os.remove(path)
                except Exception:
                    pass

    def process_image_document(self, image_path: str) -> Dict:
        """
        Process an image document (wrapper for OCR)
        """
        try:
            with open(image_path, "rb") as f:
                image_bytes = f.read()

            from finance_tracker.src.ocr.processor import OCRFactory

            ocr_processor = OCRFactory.create_processor()

            result = ocr_processor.process_image_bytes(image_bytes)

            return result

        except Exception as e:
            return {"success": False, "text": "", "error": str(e)}

    def get_images_from_pdf(self, pdf_path: str, dpi: int = 300) -> List[str]:
        """
        Get list of image file paths from PDF (temporary files)
        """
        return self.pdf_processor.convert_to_images(pdf_path, dpi)
