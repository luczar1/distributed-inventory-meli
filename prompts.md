# Development Prompts

This document contains prompts and guidelines for developing and extending the distributed inventory system.

## Architecture Design Prompts

### Concurrency Control

**Prompt**: "Design a system that handles concurrent inventory operations while maintaining data consistency. Consider scenarios where multiple users try to reserve the same item simultaneously."

**Key Considerations**:
- Optimistic vs pessimistic locking
- Per-SKU versioning strategy
- Deadlock prevention
- Performance impact of locking mechanisms

### Fault Tolerance

**Prompt**: "Implement fault tolerance for a distributed inventory system where network partitions and node failures are common. How would you handle partial failures?"

**Key Considerations**:
- Idempotency keys for operation deduplication
- Retry mechanisms with exponential backoff
- Circuit breaker patterns
- Data consistency during failures

### Scalability

**Prompt**: "Design the system to handle 10,000 concurrent operations per second while maintaining sub-100ms response times for inventory checks."

**Key Considerations**:
- Horizontal scaling strategies
- Data partitioning by SKU
- Caching strategies
- Load balancing approaches

## Implementation Prompts

### Error Handling

**Prompt**: "Create comprehensive error handling that provides meaningful feedback to users while maintaining system security. Handle edge cases like negative quantities, invalid SKUs, and system failures."

**Implementation Areas**:
- Custom error classes with context
- Error logging and monitoring
- User-friendly error messages
- Error recovery strategies

### Testing Strategy

**Prompt**: "Develop a testing strategy that covers unit tests, integration tests, and concurrency tests. Ensure 90%+ code coverage while testing edge cases and race conditions."

**Test Categories**:
- Unit tests for models and services
- Integration tests for API endpoints
- Concurrency tests for race conditions
- Performance tests for load handling

### Monitoring and Observability

**Prompt**: "Implement comprehensive monitoring that tracks system health, performance metrics, and business KPIs. Include alerting for critical issues."

**Monitoring Areas**:
- Request/response metrics
- Inventory operation metrics
- Concurrency and locking metrics
- System resource utilization

## Code Quality Prompts

### Clean Code Principles

**Prompt**: "Refactor the codebase to follow clean code principles with functions under 20 lines, classes under 200 lines, and clear naming conventions."

**Quality Metrics**:
- Cyclomatic complexity < 10
- Function length < 20 lines
- Class length < 200 lines
- Test coverage > 90%

### Performance Optimization

**Prompt**: "Optimize the system for high throughput and low latency. Focus on reducing I/O operations, minimizing memory allocations, and efficient data structures."

**Optimization Areas**:
- File I/O batching and caching
- Memory usage optimization
- Algorithm efficiency
- Database query optimization

### Security Hardening

**Prompt**: "Implement security best practices including input validation, rate limiting, and secure error handling. Prevent common vulnerabilities like injection attacks and data exposure."

**Security Measures**:
- Input validation and sanitization
- Rate limiting and DDoS protection
- Secure error messages
- Access control and authentication

## Extension Prompts

### Multi-Store Support

**Prompt**: "Extend the system to support multiple stores with centralized inventory management. Each store should have local inventory with periodic synchronization to a central system."

**Extension Areas**:
- Store-specific inventory management
- Central synchronization logic
- Conflict resolution strategies
- Store offline handling

### Advanced Features

**Prompt**: "Add advanced inventory features like batch operations, inventory transfers between stores, and automated reorder points with supplier integration."

**Advanced Features**:
- Batch inventory operations
- Inter-store transfers
- Automated reordering
- Supplier integration APIs

### Analytics and Reporting

**Prompt**: "Implement analytics and reporting features that provide insights into inventory trends, stock levels, and operational metrics."

**Analytics Features**:
- Inventory trend analysis
- Stock level reporting
- Operational metrics dashboards
- Predictive analytics for demand forecasting

## Debugging Prompts

### Concurrency Issues

**Prompt**: "Debug a scenario where inventory quantities are inconsistent after concurrent operations. Identify the root cause and implement a solution."

**Debugging Steps**:
- Analyze concurrent operation logs
- Identify race conditions
- Test with high concurrency
- Implement proper locking mechanisms

### Performance Issues

**Prompt**: "Investigate and resolve performance issues where the system becomes slow under high load. Focus on bottlenecks in file I/O and memory usage."

**Performance Analysis**:
- Profile memory usage and leaks
- Analyze file I/O patterns
- Identify CPU bottlenecks
- Optimize critical code paths

### Data Consistency Issues

**Prompt**: "Resolve data consistency issues where inventory counts don't match between different operations. Ensure atomic operations and proper error handling."

**Consistency Measures**:
- Implement atomic file operations
- Add data validation checks
- Implement reconciliation processes
- Add consistency monitoring

## Documentation Prompts

### API Documentation

**Prompt**: "Create comprehensive API documentation with examples, error codes, and integration guides for developers using the inventory system."

**Documentation Areas**:
- Endpoint specifications
- Request/response examples
- Error code reference
- Integration guides

### Operational Documentation

**Prompt**: "Write operational documentation covering deployment, monitoring, troubleshooting, and maintenance procedures for production environments."

**Operational Areas**:
- Deployment procedures
- Monitoring setup
- Troubleshooting guides
- Maintenance schedules

### Architecture Documentation

**Prompt**: "Document the system architecture including design decisions, component interactions, and scalability considerations for future development."

**Architecture Areas**:
- System design overview
- Component interactions
- Scalability considerations
- Future enhancement plans

## Code Review Prompts

### Code Quality Review

**Prompt**: "Review the codebase for code quality issues including complexity, maintainability, and adherence to best practices."

**Review Areas**:
- Code complexity analysis
- Maintainability assessment
- Best practice compliance
- Refactoring recommendations

### Security Review

**Prompt**: "Conduct a security review of the codebase identifying potential vulnerabilities and implementing security improvements."

**Security Areas**:
- Input validation review
- Authentication and authorization
- Data protection measures
- Vulnerability assessment

### Performance Review

**Prompt**: "Analyze the codebase for performance issues and optimization opportunities. Focus on bottlenecks and resource utilization."

**Performance Areas**:
- Algorithm efficiency
- Resource utilization
- Bottleneck identification
- Optimization recommendations

## Maintenance Prompts

### Technical Debt

**Prompt**: "Identify and address technical debt in the codebase including outdated dependencies, code smells, and architectural improvements."

**Debt Areas**:
- Dependency updates
- Code smell elimination
- Architectural improvements
- Documentation updates

### Feature Enhancement

**Prompt**: "Plan and implement new features while maintaining code quality and system performance. Follow agile development practices."

**Enhancement Areas**:
- Feature planning and design
- Implementation strategies
- Testing and validation
- Deployment procedures

### System Evolution

**Prompt**: "Plan the evolution of the system to handle increased scale, new requirements, and technology updates while maintaining backward compatibility."

**Evolution Areas**:
- Scalability improvements
- Technology updates
- Feature additions
- Compatibility maintenance
