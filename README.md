# Simple gallery web viewer

A simple nodejs gallery web viewer for constrained environments.
Exposes the images (jpg, gif and png) of a folder and related subfolders.

# Install manually

The server uses nodejs, which must be installed on the system.

- download or clone this repository
- install dependencies `npm i`
- create a .env file with configration (see next section)
- start the server `node --env-file=.env index.js`

# Configure

The following parameters are passed as environmental variables.
You can pass through a .env file or through the shell env variables.

| **Variable name**     | **Usage**                                                            | **Default**       |
| --------------------- | -------------------------------------------------------------------- | ----------------- |
| PORT_NUMBER           | Web server port number                                               | 8080              |
| PHOTOS_ROOT_PATH      | Path on the local file system where photos are located               | ./photos          |
| SAVE_PREVIEWS         | If true, previews are cached on files, else they are generated       | false             |
| PREVIEWS_ROOT_PATH    | The path where previews will be saved                                | ./previews        |
| PREVIEW_SIZE          | Size in px for the previews                                          | 150               |
| HTML_URL_BASE         | Base URL where the gallery HTML is served                            | /gallery/         |
| FILES_URL_BASE        | Base URL where original size pictures are served                     | /galleryfiles/    |
| PREVIEWS_URL_BASE     | Base URL where previews are served                                   | /gallerypreviews/ |
| BASIC_AUTH_USERS_FILE | If specified, the gallery will be protected by username and password | users/users.json  |
| BASIC_AUTH_REALM      | Realm of Basic Auth                                                  | simple-gallery    |

Make sure that PHOTOS_ROOT_PATH points to a root folder where all pictures are available.

If the previews are somwhat slow to produce, you can save them by setting SAVE_PREVIEWS to "true" and specifying a PREVIEWS_ROOT_PATH where all previews are saved. This path will be populated by the same folder structure as the photos root folder, when the original photos folder are visited. If you move around photos in the original pictures, you can force recreating the previews by deleting the previews folder (or any subfolder in it).

The authorization file must be setup in the following way:

```json
[
  {
    "userName": "user1",
    "password": "pwd1",
    "accessLevel": "all"
  },
  {
    "userName": "user2",
    "password": "pwd2",
    "accessLevel": "all"
  }
]
```

the acessLevel is specified as follows:

- "all" gives access to all pictures and folders
