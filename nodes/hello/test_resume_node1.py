def process_data():
    # simulate some data processing
    print("processing initial data...")
    
    # create some variables to pass to next node
    user_id = 12345
    username = "test_user"
    score = 85
    
    print(f"processed user: {username} (id: {user_id}) with score: {score}")
    
    # return variables as dictionary for next nodes
    return {
        "user_id": user_id,
        "username": username,
        "score": score,
        "processed": True
    }