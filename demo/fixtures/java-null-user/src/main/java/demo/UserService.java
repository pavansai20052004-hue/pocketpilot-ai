package demo;

public final class UserService {
    private final UserRepository repository;

    public UserService(UserRepository repository) {
        this.repository = repository;
    }

    public String displayName(long id) {
        User user = repository.findById(id);
        return user.name();
    }
}
