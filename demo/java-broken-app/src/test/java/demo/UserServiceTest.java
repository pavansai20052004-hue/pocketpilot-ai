package demo;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

public final class UserServiceTest {
    @Test
    void presentUserReturnsName() {
        UserService service = new UserService(id -> new User("Ada"));

        assertEquals("Ada", service.displayName(1));
    }

    @Test
    void missingUserUsesFallback() {
        UserService service = new UserService(id -> null);

        assertEquals("Unknown", service.displayName(404));
    }
}
