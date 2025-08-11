def my_function(input_value):

    # put your script here 

    import random
    import string

    print('Variable from previous script: ' + str(input_value))

    # generate a list of random strings with a total of 15 items
    random_strings = []
    for _ in range(15):
        nested_list = []
        for _ in range(random.randint(1, 4)):  # random number of levels
            sublist = []
            for _ in range(random.randint(1, 5)):  # random number of items in each level
                sublist.append(''.join(random.choices(string.ascii_letters + string.digits, k=random.randint(1, 10))))
            nested_list.append(sublist)
        random_strings.append(nested_list)
   
    argument1 = random_strings

    aSTING = 'hello world'

    print(argument1)

    return argument1
    return aSTING