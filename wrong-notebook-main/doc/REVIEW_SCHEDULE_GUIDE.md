# 智能复习计划功能说明

## 功能概述

基于艾宾浩斯遗忘曲线和SM-2算法，为错题本系统添加了智能复习计划功能。系统会自动为每道错题生成科学的复习日程，并在首页展示今日待复习的错题。

## 核心逻辑

### 1. 复习计划生成

当用户添加一道新错题时，系统会自动生成6个复习节点：
- 第1天：第一次复习
- 第2天：第二次复习
- 第4天：第三次复习
- 第7天：第四次复习
- 第15天：第五次复习
- 第30天：第六次复习

### 2. SM-2 算法

根据用户的复习表现，动态调整后续复习间隔：

**答对时：**
- 复习阶段递增：0 → 1 → 2 → 3 → 4 → 5 → 6
- 间隔天数递增：1 → 2 → 4 → 7 → 15 → 30 → 动态计算
- 难度系数增加：每次 +0.1（最高3.0）

**答错时：**
- 重置复习阶段：回到第1阶段
- 间隔重置：1天后再次复习
- 难度系数降低：每次 -0.2（最低1.3）

### 3. 数据结构

```prisma
model ReviewSchedule {
  id               String    @id @default(cuid())
  errorItemId      String
  errorItem        ErrorItem @relation(fields: [errorItemId], references: [id], onDelete: Cascade)
  
  scheduledFor     DateTime  // 计划复习时间
  completedAt      DateTime? // 完成复习时间
  isCorrect        Boolean?  // 是否正确
  
  // SM-2 算法字段
  reviewStage      Int      @default(0) // 复习阶段
  intervalDays     Int      @default(1) // 间隔天数
  easeFactor       Float    @default(2.5) // 难度系数
  consecutiveCorrect Int    @default(0) // 连续正确次数
  
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}
```

## API 接口

### 获取今日待复习
```
GET /api/review-schedule?action=today
```

### 获取复习统计
```
GET /api/review-schedule?action=stats
```

### 获取未来7天复习计划
```
GET /api/review-schedule?action=upcoming
```

### 标记复习完成
```
POST /api/review-schedule/complete
Body: { scheduleId: string, isCorrect: boolean }
```

### 批量生成复习计划
```
POST /api/review-schedule?action=generate
```

## 数据迁移

为现有错题生成复习计划：

```bash
node scripts/generate-review-schedules.js
```

该脚本会：
1. 查找所有没有复习计划的错题
2. 为每个错题生成6个复习节点
3. 输出统计信息

## 用户界面

### 首页
- 在操作中心添加"智能复习"按钮
- 显示今日待复习数量
- 点击跳转到复习页面

### 复习页面
- 顶部显示统计卡片（今日待复习、今日已完成、总复习计划、总已完成）
- 展示今日待复习的错题列表
- 每道题提供"还需努力"和"已掌握"两个按钮
- 完成后自动创建下一次复习计划
- 显示未来7天的复习计划

## 性能优化

- 使用数据库索引加速查询
- 批量生成复习计划时使用事务
- 前端缓存复习数据，避免重复请求

## 注意事项

1. 复习计划基于错题创建时间生成，确保用户在合适的时间复习
2. SM-2 算法会根据用户表现动态调整复习间隔
3. 答错的题目会缩短复习间隔，加强记忆
4. 答对的题目会延长复习间隔，提高效率
