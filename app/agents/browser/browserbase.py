from browserbase import Browserbase
from playwright.async_api import async_playwright, Page, Browser
import structlog

from app.config import get_settings

logger = structlog.get_logger()

_browserbase_client: Browserbase | None = None


def get_browserbase() -> Browserbase:
    global _browserbase_client
    if _browserbase_client is None:
        settings = get_settings()
        _browserbase_client = Browserbase(api_key=settings.browserbase_api_key)
    return _browserbase_client


async def create_browser_session() -> tuple[Browser, str]:
    """Create a new Browserbase session and return the browser and session ID."""
    settings = get_settings()
    bb = get_browserbase()

    # Create a new session
    session = bb.sessions.create(project_id=settings.browserbase_project_id)
    session_id = session.id

    logger.info("Created Browserbase session", session_id=session_id)

    # Connect to the session via Playwright
    playwright = await async_playwright().start()

    # Get the WebSocket URL for the session
    connect_url = session.connect_url

    browser = await playwright.chromium.connect_over_cdp(connect_url)

    return browser, session_id


async def close_browser_session(browser: Browser, session_id: str):
    """Close a Browserbase session."""
    try:
        await browser.close()
        logger.info("Closed Browserbase session", session_id=session_id)
    except Exception as e:
        logger.error("Failed to close session", session_id=session_id, error=str(e))


class BrowserbaseContext:
    """Context manager for Browserbase sessions."""

    def __init__(self):
        self.browser: Browser | None = None
        self.session_id: str | None = None
        self.page: Page | None = None

    async def __aenter__(self) -> Page:
        self.browser, self.session_id = await create_browser_session()
        context = self.browser.contexts[0] if self.browser.contexts else await self.browser.new_context()
        self.page = await context.new_page()
        return self.page

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.browser:
            await close_browser_session(self.browser, self.session_id)
