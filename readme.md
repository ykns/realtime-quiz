# Setup
1. create .env.local file in the root directory
2. add the following variables to the file
```
ABLY_API_KEY=<your_ably_api_key>
```

# How to run

1. start server 
```bash
npm server:run <number_of_participants> <question_timelimit> <path_to_question_json>
```
2. in a separate terminal, use the client to find the server session ids
```bash
npm client:search <timeout>
```
3. use client to connect to the server
```bash
npm client:run <client_name> <server_session_id>
```
4. when prompted with a question enter the answer index followed by `enter` key
