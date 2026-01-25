import asyncio
import structlog
from urllib.parse import quote_plus

from app.agents.browser.browserbase import BrowserbaseContext

logger = structlog.get_logger()


async def search_google_maps(query: str, max_results: int = 10) -> list[dict]:
    """Search Google Maps for locations matching the query."""
    logger.info("Starting Google Maps search", query=query)

    locations = []

    try:
        async with BrowserbaseContext() as page:
            # Navigate to Google Maps search
            search_url = f"https://www.google.com/maps/search/{quote_plus(query)}"
            await page.goto(search_url, wait_until="domcontentloaded")

            # Wait for results to load
            await asyncio.sleep(3)

            # Scroll to load more results
            results_container = await page.query_selector('[role="feed"]')
            if results_container:
                for _ in range(3):  # Scroll a few times to load more
                    await results_container.evaluate("el => el.scrollTop = el.scrollHeight")
                    await asyncio.sleep(1)

            # Extract place results
            place_elements = await page.query_selector_all('[data-result-index]')

            for i, place in enumerate(place_elements[:max_results]):
                try:
                    location_data = await extract_google_place(place, page)
                    if location_data:
                        locations.append(location_data)
                        logger.info("Extracted Google place", name=location_data.get("name"))
                except Exception as e:
                    logger.error("Failed to extract place", index=i, error=str(e))

    except Exception as e:
        logger.error("Google Maps search failed", query=query, error=str(e))

    logger.info("Google Maps search completed", query=query, results=len(locations))
    return locations


async def extract_google_place(place, page) -> dict | None:
    """Extract data from a Google Maps place element."""
    try:
        # Get place name
        name_element = await place.query_selector('[class*="fontHeadlineSmall"]')
        name = await name_element.inner_text() if name_element else None

        if not name:
            return None

        # Get rating
        rating_element = await place.query_selector('[class*="MW4etd"]')
        rating = await rating_element.inner_text() if rating_element else None

        # Get address/location info
        address_element = await place.query_selector('[class*="W4Efsd"]:nth-of-type(2)')
        address = await address_element.inner_text() if address_element else None

        # Get category/type
        category_element = await place.query_selector('[class*="W4Efsd"]')
        category = await category_element.inner_text() if category_element else None

        # Get images from the result
        images = []
        img_elements = await place.query_selector_all("img")
        for img in img_elements[:3]:
            src = await img.get_attribute("src")
            if src and "googleusercontent" in src:
                images.append(src)

        # Click to get more details (coordinates, etc.)
        coordinates = None
        try:
            await place.click()
            await asyncio.sleep(2)

            # Extract coordinates from URL
            current_url = page.url
            if "@" in current_url:
                coords_part = current_url.split("@")[1].split(",")[:2]
                if len(coords_part) >= 2:
                    coordinates = {
                        "lat": float(coords_part[0]),
                        "lng": float(coords_part[1]),
                    }

            # Get more photos from detail view
            detail_images = await page.query_selector_all('[class*="aoRNLd"] img')
            for img in detail_images[:5]:
                src = await img.get_attribute("src")
                if src and "googleusercontent" in src and src not in images:
                    images.append(src)

        except Exception as e:
            logger.debug("Could not get place details", error=str(e))

        return {
            "source": "google_maps",
            "source_id": None,
            "name": name,
            "description": category,
            "address": address,
            "coordinates": coordinates,
            "images": images,
            "price": None,
            "amenities": [],
            "contact": None,
            "source_url": page.url if coordinates else None,
        }

    except Exception as e:
        logger.error("Error extracting Google place", error=str(e))
        return None


async def search_google_images(query: str, max_results: int = 10) -> list[str]:
    """Search Google Images for visual references."""
    logger.info("Starting Google Images search", query=query)

    images = []

    try:
        async with BrowserbaseContext() as page:
            search_url = f"https://www.google.com/search?q={quote_plus(query)}&tbm=isch"
            await page.goto(search_url, wait_until="domcontentloaded")

            await asyncio.sleep(2)

            # Get image elements
            img_elements = await page.query_selector_all('img[data-src]')

            for img in img_elements[:max_results]:
                src = await img.get_attribute("data-src")
                if src:
                    images.append(src)

    except Exception as e:
        logger.error("Google Images search failed", query=query, error=str(e))

    logger.info("Google Images search completed", query=query, results=len(images))
    return images
