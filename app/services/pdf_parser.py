import fitz  # PyMuPDF

from pathlib import Path


def extract_text_with_pages(pdf_path: str | Path) -> list[tuple[int, str]]:
    """
    Extract text from a PDF file with page numbers.

    Args:
        pdf_path: Path to the PDF file

    Returns:
        List of tuples (page_number, page_text) where page_number starts at 1
    """
    doc = fitz.open(pdf_path)
    pages = []

    for page_num, page in enumerate(doc, start=1):
        text = page.get_text()
        pages.append((page_num, text))

    doc.close()
    return pages


def get_full_text(pdf_path: str | Path) -> str:
    """
    Extract all text from a PDF file as a single string.

    Args:
        pdf_path: Path to the PDF file

    Returns:
        Complete text content of the PDF
    """
    pages = extract_text_with_pages(pdf_path)
    return "\n\n".join(text for _, text in pages)
