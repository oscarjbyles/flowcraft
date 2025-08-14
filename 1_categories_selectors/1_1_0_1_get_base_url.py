def my_function(url):

    def GetBaseURL(url):
        # Convert url to string if it's not already
        url = str(url)
        
        url_without_https = url.replace("https://", "")
        url_parts = url_without_https.split('/')
        first_part = url_parts[0] 
        url_add_https = 'https://' + first_part

        return url_add_https

    base_url = GetBaseURL(url)

    print('base url: ' + str(base_url))

    initial_project_url = base_url

    return base_url