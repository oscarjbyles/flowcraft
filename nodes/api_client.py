# api client module
import requests
import json

def fetch_data_from_api(url, headers=None):
    """fetch data from external api"""
    response = requests.get(url, headers=headers)
    raw_data = response.json()
    return raw_data

def post_data_to_api(url, data, headers=None):
    """post data to external api"""
    response = requests.post(url, json=data, headers=headers)
    api_result = response.json()
    return api_result

def get_user_data(user_id):
    """get user data from api"""
    url = f"https://api.example.com/users/{user_id}"
    user_data = fetch_data_from_api(url)
    return user_data