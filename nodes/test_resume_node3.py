def generate_report(user_id, username, enhanced_score, level, enhancement_complete):
    # use variables from previous nodes
    print(f"generating report for user: {username}")
    print(f"user_id: {user_id}")
    print(f"final score: {enhanced_score}")
    print(f"level: {level}")
    print(f"enhancement completed: {enhancement_complete}")
    
    # generate final report
    report = f"""
    === USER REPORT ===
    user id: {user_id}
    username: {username}
    final score: {enhanced_score}
    level: {level}
    status: {'complete' if enhancement_complete else 'incomplete'}
    ==================
    """
    
    print(report)
    
    return {
        "report": report,
        "user_id": user_id,
        "final_score": enhanced_score,
        "report_generated": True
    }