# Схема бэкенда «Склад»

Диаграмма связей между таблицами (моделями SQLModel).

## ER-диаграмма (Mermaid)

```mermaid
erDiagram
    user ||--o{ item : "owner (1:N)"
    user ||--o{ itemhistory : "user_id (1:N)"
    category ||--o{ item : "category (1:N)"
    category ||--o| category : "parent/children (самоссылка)"
    item ||--o{ itemhistory : "item_id (1:N)"

    user {
        uuid id PK
        string email UK
        bool is_active
        bool is_superuser
        string full_name
        string hashed_password
    }

    category {
        uuid id PK
        string name
        uuid parent_id FK "nullable, → category.id"
    }

    item {
        uuid id PK
        string title
        string description
        int quantity
        string sku
        string barcode
        string unit
        date expires_at
        string location
        uuid owner_id FK "→ user.id, CASCADE"
        string status "incoming|warehouse|shipment"
        uuid category_id FK "nullable, → category.id, SET NULL"
        datetime created_at
    }

    itemhistory {
        uuid id PK
        uuid item_id FK "→ item.id, CASCADE"
        uuid user_id FK "→ user.id, CASCADE"
        datetime changed_at
        string field_name
        string old_value
        string new_value
    }
```

## Краткое описание связей

| Таблица       | Связь              | Описание |
|---------------|--------------------|----------|
| **user**      | → item (1:N)       | Один пользователь — много товаров. Удаление пользователя удаляет его товары (CASCADE). |
| **user**      | → itemhistory (1:N)| Кто внёс изменение в историю. |
| **category**  | → category (само)  | Иерархия: parent_id указывает на родительскую категорию. При удалении родителя у детей parent_id = NULL (SET NULL). |
| **category**  | → item (1:N)       | Одна категория — много товаров. У товара category_id опционален. При удалении категории у товаров category_id = NULL (SET NULL). |
| **item**      | → itemhistory (1:N)| История изменений полей товара. Удаление товара удаляет его историю (CASCADE). |

## Статусы Item

- `incoming` — поступления  
- `warehouse` — на складе  
- `shipment` — в отгрузке  

## Не-табличные модели (Pydantic, только API)

- **UserCreate, UserUpdate, UserPublic, UsersPublic** — пользователи  
- **CategoryCreate, CategoryUpdate, CategoryPublic** — категории  
- **ItemCreate, ItemUpdate, ItemPublic, ItemsPublic** — товары  
- **ItemHistoryPublic, ItemHistoryList** — история  
- **Message, Token, TokenPayload, NewPassword, UpdatePassword** — авторизация и ответы API  
