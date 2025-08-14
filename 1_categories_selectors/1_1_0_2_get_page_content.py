def my_function(base_url):

    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from bs4 import BeautifulSoup

    # configure chrome to run in headless mode
    chrome_options = Options()
    chrome_options.add_argument("--headless")

    driver = webdriver.Chrome(options=chrome_options)
    driver.get(base_url)
    # get the page source after the page loads
    page_source = driver.page_source

    # parse the page source into a beautifulsoup object
    soup = BeautifulSoup(page_source, "html.parser")

    # print the length to verify we got content
    print(f"page source length: {len(page_source)}")

    driver.quit()

    return page_source, soup