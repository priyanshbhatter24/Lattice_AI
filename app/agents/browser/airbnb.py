import asyncio
import structlog
from urllib.parse import quote_plus

from app.agents.browser.browserbase import BrowserbaseContext

logger = structlog.get_logger()


async def search_airbnb(query: str, max_results: int = 10) -> list[dict]:
    """Search Airbnb for locations matching the query."""
    logger.info("Starting Airbnb search", query=query)

    locations = []

    try:
        async with BrowserbaseContext() as page:
            # Navigate to Airbnb search
            search_url = f"https://www.airbnb.com/s/{quote_plus(query)}/homes"
            await page.goto(search_url, wait_until="domcontentloaded")

            # Wait for listings to load
            await page.wait_for_selector('[itemprop="itemListElement"]', timeout=15000)

            # Extract listing data
            listings = await page.query_selector_all('[itemprop="itemListElement"]')

            for i, listing in enumerate(listings[:max_results]):
                try:
                    location_data = await extract_airbnb_listing(listing, page)
                    if location_data:
                        locations.append(location_data)
                        logger.info("Extracted Airbnb listing", name=location_data.get("name"))
                except Exception as e:
                    logger.error("Failed to extract listing", index=i, error=str(e))

            # Add small delay to be respectful
            await asyncio.sleep(1)

    except Exception as e:
        logger.error("Airbnb search failed", query=query, error=str(e))

    logger.info("Airbnb search completed", query=query, results=len(locations))
    return locations


async def extract_airbnb_listing(listing, page) -> dict | None:
    """Extract data from an Airbnb listing element."""
    try:
        # Get the listing link
        link_element = await listing.query_selector("a[href*='/rooms/']")
        if not link_element:
            return None

        href = await link_element.get_attribute("href")
        source_id = href.split("/rooms/")[1].split("?")[0] if "/rooms/" in href else None

        # Get listing name/title
        title_element = await listing.query_selector('[data-testid="listing-card-title"]')
        name = await title_element.inner_text() if title_element else "Unknown"

        # Get subtitle (location/type)
        subtitle_element = await listing.query_selector('[data-testid="listing-card-subtitle"]')
        subtitle = await subtitle_element.inner_text() if subtitle_element else ""

        # Get price
        price_element = await listing.query_selector('[data-testid="price-availability-row"]')
        price = await price_element.inner_text() if price_element else None

        # Get images
        images = []
        img_elements = await listing.query_selector_all("img")
        for img in img_elements[:5]:  # Get up to 5 images
            src = await img.get_attribute("src")
            if src and "airbnb" in src:
                images.append(src)

        return {
            "source": "airbnb",
            "source_id": source_id,
            "name": name,
            "description": subtitle,
            "price": price,
            "images": images,
            "source_url": f"https://www.airbnb.com{href}" if href.startswith("/") else href,
            "amenities": [],
            "address": None,
            "coordinates": None,
            "contact": None,
        }

    except Exception as e:
        logger.error("Error extracting Airbnb listing", error=str(e))
        return None


async def get_airbnb_listing_details(listing_url: str) -> dict:
    """Get detailed information from a specific Airbnb listing page."""
    logger.info("Fetching Airbnb listing details", url=listing_url)

    details = {}

    try:
        async with BrowserbaseContext() as page:
            await page.goto(listing_url, wait_until="domcontentloaded")
            await asyncio.sleep(2)  # Let page load

            # Get location/address
            location_element = await page.query_selector('[data-section-id="LOCATION_DEFAULT"] h2')
            if location_element:
                details["address"] = await location_element.inner_text()

            # Get amenities
            amenities = []
            amenity_elements = await page.query_selector_all('[data-section-id="AMENITIES_DEFAULT"] div[role="listitem"]')
            for amenity in amenity_elements[:20]:
                text = await amenity.inner_text()
                if text:
                    amenities.append(text.strip())
            details["amenities"] = amenities

            # Get more photos
            photos = []
            photo_elements = await page.query_selector_all('img[data-original-uri]')
            for photo in photo_elements[:10]:
                src = await photo.get_attribute("src")
                if src:
                    photos.append(src)
            if photos:
                details["images"] = photos

    except Exception as e:
        logger.error("Failed to get listing details", url=listing_url, error=str(e))

    return details
