def enhance_user_data(user_id, username, score, processed):
    # use variables from previous node
    print(f"enhancing data for user: {username}")
    print(f"user_id: {user_id}")
    print(f"current score: {score}")
    print(f"was processed: {processed}")
    
    # enhance the data
    enhanced_score = score + 15
    level = "beginner" if enhanced_score < 70 else "intermediate" if enhanced_score < 90 else "advanced"
    
    print(f"enhanced score: {enhanced_score}")
    print(f"user level: {level}")
    
    # return enhanced data
    return {
        "user_id": user_id,
        "username": username,
        "original_score": score,
        "enhanced_score": enhanced_score,
        "level": level,
        "enhancement_complete": True
    }