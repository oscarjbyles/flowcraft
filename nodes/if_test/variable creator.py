def my_function():

    get_user_input = float(input('give us input: '))
    random_number = 'hello'

    print('your input was: ' + str(get_user_input))

    # put your script here 

    # return both values together so downstream nodes can consume multiple variables
    return {
        'get_user_input': get_user_input,
        'random_number': random_number,
    }