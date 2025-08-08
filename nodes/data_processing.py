# data processing module
from api_client import get_user_data

def process_data(raw_data):
    """process raw data and return cleaned results"""
    cleaned_data = []
    for item in raw_data:
        if validate_data(item):
            processed_item = {
                'id': item.get('id'),
                'name': item.get('name', '').strip(),
                'email': item.get('email', '').lower(),
                'status': 'active'
            }
            cleaned_data.append(processed_item)
    return cleaned_data

def validate_data(data):
    """validate data integrity"""
    if not isinstance(data, dict):
        return False
    required_fields = ['id', 'name', 'email']
    return all(field in data for field in required_fields)

def process_user_data(user_id):
    """process specific user data"""
    user_data = get_user_data(user_id)
    processed_data = process_data([user_data])
    return processed_data[0] if processed_data else None